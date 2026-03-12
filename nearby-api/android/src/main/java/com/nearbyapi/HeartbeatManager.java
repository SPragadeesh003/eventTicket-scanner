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

public class HeartbeatManager {
    private static final String TAG = "HeartbeatManager";

    // ── Timing constants ──────────────────────────────────────────────────────
    // Interval: how often we send a heartbeat ping
    private static final long HEARTBEAT_INTERVAL = 10_000; // 10 seconds

    // Tolerance: how many intervals we allow before declaring timeout
    // With interval=10s and tolerance=3 → timeout after ~30s of silence
    // Previously was 30s timeout with 15s interval = 2 missed beats → too aggressive
    // Now: 3 missed beats required → much more tolerant of brief BLE hiccups
    private static final int  MISSED_BEATS_BEFORE_TIMEOUT = 3;
    private static final long HEARTBEAT_TIMEOUT =
        HEARTBEAT_INTERVAL * MISSED_BEATS_BEFORE_TIMEOUT; // 30 seconds

    private final Context context;
    private final HeartbeatListener listener;
    private final Map<String, String> connectedEndpoints; // injected from module

    // Track last received heartbeat time per endpoint
    private final Map<String, Long>    lastHeartbeatTime  = new ConcurrentHashMap<>();
    // Track consecutive missed beats per endpoint (for gradual escalation)
    private final Map<String, Integer> missedBeatsCount   = new ConcurrentHashMap<>();

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
        if (isShutdown) {
            Log.w(TAG, "Was shutdown — recreating executor");
        }

        if (executor == null || executor.isShutdown()) {
            executor = Executors.newScheduledThreadPool(1);
            isShutdown = false;
        }

        if (monitorTask != null && !monitorTask.isDone()) {
            monitorTask.cancel(false);
        }

        monitorTask = executor.scheduleAtFixedRate(() -> {
            if (isShutdown) return;

            long now = System.currentTimeMillis();

            for (String endpointId : lastHeartbeatTime.keySet()) {

                // Guard: skip peers no longer in connected set
                if (!connectedEndpoints.containsKey(endpointId)) {
                    lastHeartbeatTime.remove(endpointId);
                    missedBeatsCount.remove(endpointId);
                    continue;
                }

                long lastBeat     = lastHeartbeatTime.getOrDefault(endpointId, now);
                long timeSinceLast = now - lastBeat;

                if (timeSinceLast > HEARTBEAT_TIMEOUT) {
                    // ── Escalate missed beat count ───────────────────────────
                    int missed = missedBeatsCount.getOrDefault(endpointId, 0) + 1;
                    missedBeatsCount.put(endpointId, missed);

                    Log.w(TAG, "Missed beat #" + missed + " for: " + endpointId
                        + " (" + timeSinceLast + "ms since last)");

                    if (missed >= MISSED_BEATS_BEFORE_TIMEOUT) {
                        // Only NOW declare timeout after N consecutive misses
                        Log.e(TAG, "HEARTBEAT TIMEOUT after " + missed
                            + " missed beats: " + endpointId);
                        lastHeartbeatTime.remove(endpointId);
                        missedBeatsCount.remove(endpointId);
                        listener.onHeartbeatTimeout(endpointId);
                    }
                } else {
                    // Received recently — reset missed count and send next beat
                    missedBeatsCount.put(endpointId, 0);
                    sendHeartbeat(endpointId);
                }
            }
        }, HEARTBEAT_INTERVAL, HEARTBEAT_INTERVAL, TimeUnit.MILLISECONDS);

        Log.d(TAG, "Heartbeat started — interval=" + HEARTBEAT_INTERVAL
            + "ms, timeout after " + MISSED_BEATS_BEFORE_TIMEOUT + " missed beats");
    }

    public void startHeartbeatForEndpoint(String endpointId) {
        if (isShutdown) return;
        lastHeartbeatTime.put(endpointId, System.currentTimeMillis());
        missedBeatsCount.put(endpointId, 0);
        Log.d(TAG, "Tracking heartbeat for: " + endpointId);
    }

    public void stopHeartbeatForEndpoint(String endpointId) {
        lastHeartbeatTime.remove(endpointId);
        missedBeatsCount.remove(endpointId);
        Log.d(TAG, "Stopped heartbeat for: " + endpointId);
    }

    public void recordHeartbeatReceived(String endpointId) {
        if (lastHeartbeatTime.containsKey(endpointId)) {
            lastHeartbeatTime.put(endpointId, System.currentTimeMillis());
            missedBeatsCount.put(endpointId, 0); // reset on any received beat
        }
    }

    private void sendHeartbeat(String endpointId) {
        try {
            Nearby.getConnectionsClient(context)
                .sendPayload(endpointId, Payload.fromBytes(new byte[]{0x00}));
        } catch (Exception e) {
            Log.w(TAG, "Heartbeat send failed for " + endpointId + ": " + e.getMessage());
            // Don't disconnect here — let the missed beat counter handle it
        }
    }

    public void shutdown() {
        isShutdown = true;
        Log.d(TAG, "Shutting down HeartbeatManager");

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
        missedBeatsCount.clear();
    }
}