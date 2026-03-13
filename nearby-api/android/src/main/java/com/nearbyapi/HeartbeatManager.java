package com.nearbyapi;

import android.content.Context;
import android.util.Log;
import com.google.android.gms.nearby.Nearby;
import com.google.android.gms.nearby.connection.Payload;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public class HeartbeatManager {
    private static final String TAG = "HeartbeatManager";

    private static final long HEARTBEAT_INTERVAL_MS = 8_000;

    private static final int  MISSED_BEATS_BEFORE_TIMEOUT = 3;
    private static final long TIMEOUT_MS =
        HEARTBEAT_INTERVAL_MS * MISSED_BEATS_BEFORE_TIMEOUT;

    private static final int CONSECUTIVE_SEND_FAILURES_BEFORE_TIMEOUT = 3;

    private final Context                context;
    private final HeartbeatListener      listener;
    private final Map<String, String>    connectedEndpoints;

    private final Map<String, Long>    lastHeartbeatTime     = new ConcurrentHashMap<>();
    private final Map<String, Long>    lastSentTime          = new ConcurrentHashMap<>();
    private final Map<String, Integer> missedBeatsCount      = new ConcurrentHashMap<>();
    private final Map<String, AtomicInteger> sendFailCount   = new ConcurrentHashMap<>();

    private ScheduledFuture<?>       monitorTask;
    private ScheduledExecutorService executor;
    private volatile boolean         isShutdown = false;

    public interface HeartbeatListener {
        void onHeartbeatTimeout(String endpointId);
    }

    public HeartbeatManager(Context context,
                             Map<String, String> connectedEndpoints,
                             HeartbeatListener listener) {
        this.context            = context;
        this.connectedEndpoints = connectedEndpoints;
        this.listener           = listener;
    }

    public void startHeartbeat() {
        if (executor == null || executor.isShutdown()) {
            executor   = Executors.newScheduledThreadPool(1);
            isShutdown = false;
        }

        if (monitorTask != null && !monitorTask.isDone()) {
            monitorTask.cancel(false);
        }

        monitorTask = executor.scheduleAtFixedRate(
            this::runMonitorCycle,
            HEARTBEAT_INTERVAL_MS,
            HEARTBEAT_INTERVAL_MS,
            TimeUnit.MILLISECONDS
        );

        Log.d(TAG, "Heartbeat started — interval=" + HEARTBEAT_INTERVAL_MS
            + "ms, timeout after " + MISSED_BEATS_BEFORE_TIMEOUT + " missed beats");
    }
    private void runMonitorCycle() {
        if (isShutdown) return;

        long now = System.currentTimeMillis();

        for (String endpointId : lastHeartbeatTime.keySet()) {

            if (!connectedEndpoints.containsKey(endpointId)) {
                cleanupEndpoint(endpointId);
                continue;
            }

            long lastReceived  = lastHeartbeatTime.getOrDefault(endpointId, now);
            long timeSinceLast = now - lastReceived;

            if (timeSinceLast > TIMEOUT_MS) {
                int missed = missedBeatsCount.getOrDefault(endpointId, 0) + 1;
                missedBeatsCount.put(endpointId, missed);

                Log.w(TAG, "Missed response #" + missed + " from: " + endpointId
                    + " (" + (timeSinceLast / 1000) + "s since last received)");

                if (missed >= MISSED_BEATS_BEFORE_TIMEOUT) {
                    declareTimeout(endpointId, "missed " + missed + " responses");
                    continue;
                }
            } else {
                missedBeatsCount.put(endpointId, 0);
                sendFailCount.computeIfAbsent(endpointId,
                    k -> new AtomicInteger(0)).set(0);
            }

            sendHeartbeat(endpointId, now);
        }
    }

    public void startHeartbeatForEndpoint(String endpointId) {
        if (isShutdown) return;
        long now = System.currentTimeMillis();
        lastHeartbeatTime.put(endpointId, now);
        lastSentTime.put(endpointId, now);
        missedBeatsCount.put(endpointId, 0);
        sendFailCount.put(endpointId, new AtomicInteger(0));
        Log.d(TAG, "Tracking heartbeat for: " + endpointId);

        sendHeartbeat(endpointId, now);
    }

    public void stopHeartbeatForEndpoint(String endpointId) {
        cleanupEndpoint(endpointId);
        Log.d(TAG, "Stopped heartbeat tracking for: " + endpointId);
    }

    public void recordHeartbeatReceived(String endpointId) {
        if (!lastHeartbeatTime.containsKey(endpointId)) return;
        lastHeartbeatTime.put(endpointId, System.currentTimeMillis());
        missedBeatsCount.put(endpointId, 0);
        AtomicInteger fc = sendFailCount.get(endpointId);
        if (fc != null) fc.set(0);
    }

    public void schedulePostBurstProbe(String endpointId) {
        if (isShutdown || executor == null || executor.isShutdown()) return;

        Log.d(TAG, "Scheduling post-burst probe for: " + endpointId);

        executor.schedule(() -> {
            if (isShutdown) return;
            if (!connectedEndpoints.containsKey(endpointId)) return;

            Log.d(TAG, "Post-burst probe firing for: " + endpointId);
            sendHeartbeat(endpointId, System.currentTimeMillis());
        }, 2_000, TimeUnit.MILLISECONDS);
    }

    private void sendHeartbeat(String endpointId, long now) {
        lastSentTime.put(endpointId, now);
        try {
            Payload beat = Payload.fromBytes(new byte[]{0x00});
            Nearby.getConnectionsClient(context)
                  .sendPayload(endpointId, beat)
                  .addOnFailureListener(e -> {
                      if (isShutdown) return;

                      AtomicInteger fc = sendFailCount.computeIfAbsent(
                          endpointId, k -> new AtomicInteger(0));
                      int fails = fc.incrementAndGet();

                      Log.w(TAG, "Heartbeat SEND failed (#" + fails + ") for "
                          + endpointId + ": " + e.getMessage());

                      if (fails >= CONSECUTIVE_SEND_FAILURES_BEFORE_TIMEOUT) {
                          declareTimeout(endpointId,
                              "send failed " + fails + " times consecutively");
                      }
                  });
        } catch (Exception e) {
            Log.w(TAG, "Heartbeat send exception for " + endpointId + ": " + e.getMessage());

            AtomicInteger fc = sendFailCount.computeIfAbsent(
                endpointId, k -> new AtomicInteger(0));
            int fails = fc.incrementAndGet();
            if (fails >= CONSECUTIVE_SEND_FAILURES_BEFORE_TIMEOUT) {
                declareTimeout(endpointId, "send exception " + fails + " times");
            }
        }
    }

    private void declareTimeout(String endpointId, String reason) {
        if (!lastHeartbeatTime.containsKey(endpointId)) return; // already timed out

        Log.e(TAG, "HEARTBEAT TIMEOUT (" + reason + "): " + endpointId);
        cleanupEndpoint(endpointId);
        listener.onHeartbeatTimeout(endpointId);
    }

    private void cleanupEndpoint(String endpointId) {
        lastHeartbeatTime.remove(endpointId);
        lastSentTime.remove(endpointId);
        missedBeatsCount.remove(endpointId);
        sendFailCount.remove(endpointId);
    }
    public void shutdown() {
        isShutdown = true;

        if (monitorTask != null) {
            monitorTask.cancel(false);
            monitorTask = null;
        }

        if (executor != null) {
            executor.shutdown();
            try {
                if (!executor.awaitTermination(5, TimeUnit.SECONDS)) {
                    executor.shutdownNow();
                }
            } catch (InterruptedException e) {
                executor.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }

        lastHeartbeatTime.clear();
        lastSentTime.clear();
        missedBeatsCount.clear();
        sendFailCount.clear();
        Log.d(TAG, "HeartbeatManager shut down");
    }
}