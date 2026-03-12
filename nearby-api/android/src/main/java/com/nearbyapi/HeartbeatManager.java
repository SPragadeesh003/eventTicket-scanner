package com.nearbyapi;

import android.content.Context;
import android.util.Log;
import com.google.android.gms.nearby.Nearby;
import com.google.android.gms.nearby.connection.Payload;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class HeartbeatManager {
    private static final String TAG = "HeartbeatManager";
    private static final long HEARTBEAT_INTERVAL = 15000; // 15 seconds
    private static final long HEARTBEAT_TIMEOUT  = 45000; // 45 seconds
    // NOTE: Timeout must be > 2x interval to avoid false positives
    // (one missed heartbeat is acceptable; two consecutive means dead peer)

    private final Context context;
    private final HeartbeatListener listener;

    // FIX #4: Reference to live connected set from NearbyConnectionsModule
    // Used to guard against sending heartbeats to already-disconnected peers
    private final Map<String, String> connectedEndpoints;

    private final Map<String, Long> lastHeartbeatTime = new ConcurrentHashMap<>();
    private ScheduledFuture<?> monitorTask;
    private ScheduledExecutorService executor;
    private volatile boolean isShutdown = false;

    public interface HeartbeatListener {
        void onHeartbeatTimeout(String endpointId);
    }

    // FIX #4: Accept connectedEndpoints from module so we can guard dead-peer sends
    public HeartbeatManager(Context context,
                             Map<String, String> connectedEndpoints,
                             HeartbeatListener listener) {
        this.context            = context;
        this.connectedEndpoints = connectedEndpoints;
        this.listener           = listener;
    }

    public void startHeartbeat() {
        if (isShutdown) {
            Log.w(TAG, "Cannot start heartbeat — manager is shutdown");
            return;
        }

        // Create fresh executor (FIX #7 pattern applied here too)
        if (executor == null || executor.isShutdown()) {
            executor = Executors.newScheduledThreadPool(1);
        }

        if (monitorTask != null && !monitorTask.isDone()) {
            monitorTask.cancel(false);
        }

        monitorTask = executor.scheduleAtFixedRate(() -> {
            if (isShutdown) return;

            long now = System.currentTimeMillis();

            for (String endpointId : lastHeartbeatTime.keySet()) {

                // FIX #4: Skip peers that are no longer connected
                // Prevents sending heartbeat bytes to dead endpoints
                if (!connectedEndpoints.containsKey(endpointId)) {
                    Log.d(TAG, "Skipping heartbeat for disconnected peer: " + endpointId);
                    lastHeartbeatTime.remove(endpointId);
                    continue;
                }

                long timeSinceLast = now - lastHeartbeatTime.getOrDefault(endpointId, now);

                if (timeSinceLast > HEARTBEAT_TIMEOUT) {
                    Log.w(TAG, "HEARTBEAT TIMEOUT: " + endpointId + " (" + timeSinceLast + "ms since last)");
                    lastHeartbeatTime.remove(endpointId);
                    listener.onHeartbeatTimeout(endpointId);
                } else {
                    sendHeartbeat(endpointId);
                }
            }
        }, HEARTBEAT_INTERVAL, HEARTBEAT_INTERVAL, TimeUnit.MILLISECONDS);

        Log.d(TAG, "Heartbeat monitor started (interval=" + HEARTBEAT_INTERVAL + "ms, timeout=" + HEARTBEAT_TIMEOUT + "ms)");
    }

    public void startHeartbeatForEndpoint(String endpointId) {
        if (isShutdown) return;
        Log.d(TAG, "Tracking heartbeat for: " + endpointId);
        lastHeartbeatTime.put(endpointId, System.currentTimeMillis());
    }

    public void stopHeartbeatForEndpoint(String endpointId) {
        Log.d(TAG, "Stopped heartbeat tracking for: " + endpointId);
        lastHeartbeatTime.remove(endpointId);
    }

    public void recordHeartbeatReceived(String endpointId) {
        // Only update if we're still tracking this endpoint
        if (lastHeartbeatTime.containsKey(endpointId)) {
            lastHeartbeatTime.put(endpointId, System.currentTimeMillis());
        }
    }

    private void sendHeartbeat(String endpointId) {
        try {
            Nearby.getConnectionsClient(context)
                .sendPayload(endpointId, Payload.fromBytes(new byte[]{0x00}));
        } catch (Exception e) {
            Log.e(TAG, "Heartbeat send failed for " + endpointId + ": " + e.getMessage());
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
        // NOTE: beatTasks removed — was dead code (FIX #11)
    }
}