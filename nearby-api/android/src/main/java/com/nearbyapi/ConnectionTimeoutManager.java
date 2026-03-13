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
    private static final long   CONNECTION_TIMEOUT = 30000;

    private final Map<String, ScheduledFuture<?>> timeoutTasks = new ConcurrentHashMap<>();

    private ScheduledExecutorService executor;
    private volatile boolean isShutdown = false;

    public ConnectionTimeoutManager() {
        this.executor = Executors.newScheduledThreadPool(1);
    }
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
        }

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