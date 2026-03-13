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

    // Send a heartbeat ping every 8 seconds
    private static final long HEARTBEAT_INTERVAL_MS       = 8_000;

    // Declare ghost after 3 consecutive missed responses = 24 seconds
    private static final int  MISSED_BEATS_BEFORE_TIMEOUT = 3;
    private static final long TIMEOUT_MS =
        HEARTBEAT_INTERVAL_MS * MISSED_BEATS_BEFORE_TIMEOUT;

    // After a payload burst (sync), Nearby's send queue may be full.
    // sendPayload() will throw or return a failed Task for queued heartbeats.
    // If we see N consecutive SEND failures (not receive failures), declare
    // the channel stalled immediately — don't wait the full 24s.
    private static final int CONSECUTIVE_SEND_FAILURES_BEFORE_TIMEOUT = 3;

    private final Context                context;
    private final HeartbeatListener      listener;
    private final Map<String, String>    connectedEndpoints;

    // lastHeartbeatTime: when we last RECEIVED a beat from this endpoint
    private final Map<String, Long>    lastHeartbeatTime     = new ConcurrentHashMap<>();
    // lastSentTime: when we last successfully SENT a beat to this endpoint
    private final Map<String, Long>    lastSentTime          = new ConcurrentHashMap<>();
    // Consecutive missed RESPONSES (peer not sending back)
    private final Map<String, Integer> missedBeatsCount      = new ConcurrentHashMap<>();
    // Consecutive SEND failures (our send() call itself is failing)
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

    // ─────────────────────────────────────────────────────────────────────────
    //  START GLOBAL MONITOR
    // ─────────────────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────────────────
    //  MONITOR CYCLE — runs every HEARTBEAT_INTERVAL_MS
    // ─────────────────────────────────────────────────────────────────────────
    private void runMonitorCycle() {
        if (isShutdown) return;

        long now = System.currentTimeMillis();

        for (String endpointId : lastHeartbeatTime.keySet()) {

            // Remove tracking for peers that are no longer connected
            if (!connectedEndpoints.containsKey(endpointId)) {
                cleanupEndpoint(endpointId);
                continue;
            }

            long lastReceived  = lastHeartbeatTime.getOrDefault(endpointId, now);
            long timeSinceLast = now - lastReceived;

            if (timeSinceLast > TIMEOUT_MS) {
                // ── Missed response window exceeded ───────────────────────────
                int missed = missedBeatsCount.getOrDefault(endpointId, 0) + 1;
                missedBeatsCount.put(endpointId, missed);

                Log.w(TAG, "Missed response #" + missed + " from: " + endpointId
                    + " (" + (timeSinceLast / 1000) + "s since last received)");

                if (missed >= MISSED_BEATS_BEFORE_TIMEOUT) {
                    declareTimeout(endpointId, "missed " + missed + " responses");
                    continue;
                }
            } else {
                // Response received recently — reset missed counter
                missedBeatsCount.put(endpointId, 0);
                sendFailCount.computeIfAbsent(endpointId,
                    k -> new AtomicInteger(0)).set(0);
            }

            // Always send a beat on every cycle
            sendHeartbeat(endpointId, now);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  PER-ENDPOINT TRACKING
    // ─────────────────────────────────────────────────────────────────────────
    public void startHeartbeatForEndpoint(String endpointId) {
        if (isShutdown) return;
        long now = System.currentTimeMillis();
        lastHeartbeatTime.put(endpointId, now);
        lastSentTime.put(endpointId, now);
        missedBeatsCount.put(endpointId, 0);
        sendFailCount.put(endpointId, new AtomicInteger(0));
        Log.d(TAG, "Tracking heartbeat for: " + endpointId);

        // Immediate beat so peer knows we're alive right away
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
        if (fc != null) fc.set(0); // receiving means channel is alive — reset send fails too
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  POST-BURST PROBE
    //
    //  Called by NearbyConnectionsModule after broadcastPayload() completes
    //  a sync burst (multiple payloads sent back-to-back to a new peer).
    //
    //  After a burst, Nearby's send queue may be saturated. We schedule a
    //  probe 2 seconds later — if it fails or gets no response within one
    //  heartbeat interval, we declare the connection stalled immediately
    //  instead of waiting the full 24-second timeout.
    // ─────────────────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────────────────
    //  SEND HEARTBEAT
    // ─────────────────────────────────────────────────────────────────────────
    private void sendHeartbeat(String endpointId, long now) {
        lastSentTime.put(endpointId, now);
        try {
            // Fresh Payload each time — Nearby deduplicates by payload ID
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

                      // If the send itself is failing repeatedly, the channel is
                      // stalled — don't wait for the full response timeout.
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

    // ─────────────────────────────────────────────────────────────────────────
    //  DECLARE TIMEOUT
    // ─────────────────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────────────────
    //  SHUTDOWN
    // ─────────────────────────────────────────────────────────────────────────
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