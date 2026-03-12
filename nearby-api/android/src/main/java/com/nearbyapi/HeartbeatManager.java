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
    private static final long HEARTBEAT_INTERVAL = 15000; // 15 seconds
    private static final long HEARTBEAT_TIMEOUT = 30000; // 30 seconds
    
    private final Context context;
    private final HeartbeatListener listener;
    private final Map<String, Long> lastHeartbeatTime = new ConcurrentHashMap<>();
    private final Map<String, ScheduledFuture<?>> beatTasks = new ConcurrentHashMap<>();
    private final ScheduledExecutorService executor = 
        Executors.newScheduledThreadPool(1);
    private ScheduledFuture<?> monitorTask;
    private boolean isShutdown = false;

    public interface HeartbeatListener {
        void onHeartbeatTimeout(String endpointId);
    }

    public HeartbeatManager(Context context, HeartbeatListener listener) {
        this.context = context;
        this.listener = listener;
    }

    public void startHeartbeat() {
        if (isShutdown) {
            Log.w(TAG, "Cannot start heartbeat - manager is shutdown");
            return;
        }

        if (monitorTask != null) {
            monitorTask.cancel(false);
        }

        monitorTask = executor.scheduleAtFixedRate(() -> {
            if (isShutdown) return;

            long now = System.currentTimeMillis();
            for (String endpointId : lastHeartbeatTime.keySet()) {
                long timeSinceLastBeat = now - lastHeartbeatTime.getOrDefault(endpointId, 0L);
                
                if (timeSinceLastBeat > HEARTBEAT_TIMEOUT) {
                    Log.w(TAG, "HEARTBEAT TIMEOUT: " + endpointId + 
                        " (" + timeSinceLastBeat + "ms)");
                    listener.onHeartbeatTimeout(endpointId);
                } else {
                    sendHeartbeat(endpointId);
                }
            }
        }, HEARTBEAT_INTERVAL, HEARTBEAT_INTERVAL, TimeUnit.MILLISECONDS);

        Log.d(TAG, "Heartbeat monitor started");
    }

    public void startHeartbeatForEndpoint(String endpointId) {
        if (isShutdown) {
            Log.w(TAG, "Cannot start heartbeat for endpoint - manager is shutdown");
            return;
        }

        Log.d(TAG, "Started heartbeat tracking for " + endpointId);
        lastHeartbeatTime.put(endpointId, System.currentTimeMillis());
    }

    public void stopHeartbeatForEndpoint(String endpointId) {
        Log.d(TAG, "Stopped heartbeat tracking for " + endpointId);
        lastHeartbeatTime.remove(endpointId);
    }

    private void sendHeartbeat(String endpointId) {
        try {
            Nearby.getConnectionsClient(context).sendPayload(
                endpointId,
                Payload.fromBytes(new byte[]{0x00})
            );
        } catch (Exception e) {
            Log.e(TAG, "Heartbeat send failed for " + endpointId, e);
        }
    }

    public void recordHeartbeatReceived(String endpointId) {
        lastHeartbeatTime.put(endpointId, System.currentTimeMillis());
    }

    public void shutdown() {
        isShutdown = true;
        Log.d(TAG, "Shutting down HeartbeatManager");

        if (monitorTask != null) {
            monitorTask.cancel(false);
        }

        executor.shutdown();
        try {
            if (!executor.awaitTermination(5, TimeUnit.SECONDS)) {
                executor.shutdownNow();
            }
        } catch (InterruptedException e) {
            executor.shutdownNow();
        }

        lastHeartbeatTime.clear();
        beatTasks.clear();
    }
}