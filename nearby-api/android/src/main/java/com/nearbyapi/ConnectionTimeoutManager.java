package com.nearbyapi;

import android.util.Log;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class ConnectionTimeoutManager {
    private static final String TAG                = "TimeoutManager";
    private static final long   CONNECTION_TIMEOUT = 30000; // 30 seconds

    private final Map<String, ScheduledFuture<?>> timeoutTasks = new ConcurrentHashMap<>();

    // FIX #7: Non-final so it can be recreated after shutdown
    private ScheduledExecutorService executor;
    private volatile boolean isShutdown = false;

    public ConnectionTimeoutManager() {
        this.executor = Executors.newScheduledThreadPool(1);
    }

    // FIX #7: Lazy executor getter — recreates if previously shut down
    // This is called by startConnectionTimeout() which may be called after
    // a stop()/start() cycle on the Nearby service
    private ScheduledExecutorService getExecutor() {
        if (executor == null || executor.isShutdown()) {
            Log.d(TAG, "Recreating executor after shutdown");
            executor   = Executors.newScheduledThreadPool(1);
            isShutdown = false;
        }
        return executor;
    }

    public void startConnectionTimeout(String endpointId, Runnable onTimeout) {
        if (isShutdown) {
            Log.w(TAG, "Manager was shutdown — recreating executor for: " + endpointId);
            // getExecutor() will recreate it
        }

        // Cancel any existing timeout for this endpoint before starting a new one
        cancelTimeout(endpointId);

        Log.d(TAG, "Starting " + CONNECTION_TIMEOUT + "ms timeout for: " + endpointId);

        ScheduledFuture<?> future = getExecutor().schedule(() -> {
            if (isShutdown) {
                Log.d(TAG, "Skipping timeout callback — manager is shutdown");
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
        if (future != null && !future.isDone()) {
            Log.d(TAG, "Cancelled timeout for: " + endpointId);
            future.cancel(false);
        }
    }

    public void shutdown() {
        isShutdown = true;
        Log.d(TAG, "Shutting down ConnectionTimeoutManager");

        // Cancel all pending timeouts explicitly
        for (Map.Entry<String, ScheduledFuture<?>> entry : timeoutTasks.entrySet()) {
            entry.getValue().cancel(false);
        }
        timeoutTasks.clear();

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
    }
}