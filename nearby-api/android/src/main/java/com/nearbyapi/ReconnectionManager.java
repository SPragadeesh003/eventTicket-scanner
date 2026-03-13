package com.nearbyapi;

import android.content.Context;
import android.util.Log;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class ReconnectionManager {
    private static final String TAG = "ReconnectionMgr";
    private static final int    MAX_RETRIES = 8; restart
    private static final long   INITIAL_BACKOFF = 500; 
    private static final long   MAX_BACKOFF = 10_000;

    private final Context context;
    private final ReconnectionListener listener;

    private final Map<String, ReconnectAttempt> reconnectAttempts = new ConcurrentHashMap<>();
    private final Map<String, String> nameToEndpointId = new ConcurrentHashMap<>();

    private final Map<String, ScheduledFuture<?>> scheduledFutures = new ConcurrentHashMap<>();

    private ScheduledExecutorService executor;
    private volatile boolean isShutdown = false;

    public interface ReconnectionListener {
        void onReconnectScheduled(String endpointId, int attempt);
        void onReconnectAttempt(String endpointId, int attempt);
        void onReconnectFailed(String endpointId);
    }

    public ReconnectionManager(Context context, ReconnectionListener listener) {
        this.context  = context;
        this.listener = listener;
        this.executor = Executors.newScheduledThreadPool(2);
    }

    // FIX #7: Return a live executor, recreating if previously shut down
    private ScheduledExecutorService getExecutor() {
        if (executor == null || executor.isShutdown()) {
            Log.d(TAG, "Recreating executor after shutdown");
            executor   = Executors.newScheduledThreadPool(2);
            isShutdown = false;
        }
        return executor;
    }

    public void scheduleReconnect(String endpointId, String endpointName) {
        if (isShutdown) {
            Log.w(TAG, "Cannot schedule reconnect — manager is shutdown");
            return;
        }

        ReconnectAttempt attempt = reconnectAttempts.getOrDefault(
            endpointId,
            new ReconnectAttempt(endpointId, endpointName)
        );

        if (attempt.retryCount >= MAX_RETRIES) {
            Log.e(TAG, "MAX RETRIES EXCEEDED: " + endpointId);
            reconnectAttempts.remove(endpointId);
            scheduledFutures.remove(endpointId);
            listener.onReconnectFailed(endpointId);
            return;
        }

        long backoffMs = Math.min(MAX_BACKOFF, INITIAL_BACKOFF * (long) Math.pow(2, attempt.retryCount));
        attempt.retryCount++;
        reconnectAttempts.put(endpointId, attempt);
        nameToEndpointId.put(endpointName, endpointId); // track for clearAttemptsByName

        Log.d(TAG, "Scheduling reconnect to " + endpointName
            + " (attempt " + attempt.retryCount + "/" + MAX_RETRIES
            + ") in " + backoffMs + "ms");

        listener.onReconnectScheduled(endpointId, attempt.retryCount);

        // FIX #6: Store the future so shutdown() can cancel it
        ScheduledFuture<?> future = getExecutor().schedule(() -> {
            if (isShutdown) {
                Log.w(TAG, "Skipping reconnect — manager shut down during backoff");
                return;
            }
            Log.d(TAG, "RECONNECT ATTEMPT " + attempt.retryCount + " for: " + endpointId);
            scheduledFutures.remove(endpointId);
            listener.onReconnectAttempt(endpointId, attempt.retryCount);
        }, backoffMs, TimeUnit.MILLISECONDS);

        // Cancel any previous pending future for this endpoint before storing new one
        ScheduledFuture<?> previous = scheduledFutures.put(endpointId, future);
        if (previous != null && !previous.isDone()) {
            previous.cancel(false);
        }
    }

    public void clearAttempts(String endpointId) {
        ReconnectAttempt attempt = reconnectAttempts.remove(endpointId);
        if (attempt != null) nameToEndpointId.remove(attempt.endpointName);

        // FIX #6: Also cancel any pending future when connection succeeds
        ScheduledFuture<?> future = scheduledFutures.remove(endpointId);
        if (future != null && !future.isDone()) {
            future.cancel(false);
            Log.d(TAG, "Cancelled pending reconnect for: " + endpointId);
        }

        Log.d(TAG, "Cleared reconnection attempts for: " + endpointId);
    }

    // Cancel all retries for a device by name regardless of endpointId.
    // Called when a device reconnects with a NEW endpointId -- the old retry
    // loop (keyed by old endpointId) would otherwise run to MAX_RETRIES.
    public void clearAttemptsByName(String deviceName) {
        String oldEndpointId = nameToEndpointId.remove(deviceName);
        if (oldEndpointId == null) {
            Log.d(TAG, "clearAttemptsByName: no stale attempts for " + deviceName);
            return;
        }
        Log.d(TAG, "Clearing stale reconnect loop for " + deviceName
            + " (old endpointId: " + oldEndpointId + ")");
        reconnectAttempts.remove(oldEndpointId);
        ScheduledFuture<?> future = scheduledFutures.remove(oldEndpointId);
        if (future != null && !future.isDone()) {
            future.cancel(false);
            Log.d(TAG, "Cancelled stale retry loop for: " + deviceName);
        }
    }

    public void shutdown() {
        isShutdown = true;
        Log.d(TAG, "Shutting down ReconnectionManager");

        // FIX #6: Cancel ALL in-flight scheduled futures
        for (Map.Entry<String, ScheduledFuture<?>> entry : scheduledFutures.entrySet()) {
            entry.getValue().cancel(false);
            Log.d(TAG, "Cancelled scheduled reconnect for: " + entry.getKey());
        }
        scheduledFutures.clear();

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

        reconnectAttempts.clear();
        nameToEndpointId.clear();
    }

    private static class ReconnectAttempt {
        final String endpointId;
        final String endpointName;
        int  retryCount = 0;
        final long firstAttemptTime;

        ReconnectAttempt(String endpointId, String endpointName) {
            this.endpointId       = endpointId;
            this.endpointName     = endpointName;
            this.firstAttemptTime = System.currentTimeMillis();
        }
    }
}