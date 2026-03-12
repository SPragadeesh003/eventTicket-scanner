package com.nearbyapi;

import android.util.Log;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class ConnectionTimeoutManager {
    private static final String TAG = "TimeoutManager";
    private static final long CONNECTION_TIMEOUT = 30000; // 30 seconds
    
    private final Map<String, ScheduledFuture<?>> timeoutTasks = 
        new ConcurrentHashMap<>();
    private final ScheduledExecutorService executor = 
        Executors.newScheduledThreadPool(1);
    private boolean isShutdown = false;

    public void startConnectionTimeout(String endpointId, Runnable onTimeout) {
        if (isShutdown) {
            Log.w(TAG, "Cannot start timeout - manager is shutdown");
            return;
        }

        Log.d(TAG, "Starting timeout for " + endpointId);
        
        ScheduledFuture<?> future = executor.schedule(() -> {
            if (isShutdown) {
                Log.d(TAG, "Skipping timeout callback - manager is shutdown");
                return;
            }

            Log.w(TAG, "CONNECTION TIMEOUT: " + endpointId);
            timeoutTasks.remove(endpointId);
            onTimeout.run();
        }, CONNECTION_TIMEOUT, TimeUnit.MILLISECONDS);

        timeoutTasks.put(endpointId, future);
    }

    public void cancelTimeout(String endpointId) {
        ScheduledFuture<?> future = timeoutTasks.remove(endpointId);
        if (future != null) {
            Log.d(TAG, "Cancelled timeout for " + endpointId);
            future.cancel(false);
        }
    }

    public void shutdown() {
        isShutdown = true;
        Log.d(TAG, "Shutting down ConnectionTimeoutManager");

        executor.shutdown();
        try {
            if (!executor.awaitTermination(5, TimeUnit.SECONDS)) {
                executor.shutdownNow();
            }
        } catch (InterruptedException e) {
            executor.shutdownNow();
        }

        timeoutTasks.clear();
    }
}