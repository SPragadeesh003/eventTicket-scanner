package com.nearbyapi;

import android.content.Context;
import android.util.Log;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public class ReconnectionManager {
    private static final String TAG = "ReconnectionMgr";
    private static final int MAX_RETRIES = 5;
    private static final long INITIAL_BACKOFF = 500; // 0.5 seconds (faster retry)
    
    private final Context context;
    private final ReconnectionListener listener;
    private final Map<String, ReconnectAttempt> reconnectAttempts = 
        new ConcurrentHashMap<>();
    private final ScheduledExecutorService executor = 
        Executors.newScheduledThreadPool(2);
    private boolean isShutdown = false;

    public interface ReconnectionListener {
        void onReconnectScheduled(String endpointId, int attempt);
        void onReconnectAttempt(String endpointId, int attempt);
        void onReconnectFailed(String endpointId);
    }

    public ReconnectionManager(Context context, ReconnectionListener listener) {
        this.context = context;
        this.listener = listener;
    }

    public void scheduleReconnect(String endpointId, String endpointName) {
        if (isShutdown) {
            Log.w(TAG, "Cannot schedule reconnect - manager is shutdown");
            return;
        }

        ReconnectAttempt attempt = reconnectAttempts.getOrDefault(
            endpointId, 
            new ReconnectAttempt(endpointId, endpointName)
        );

        if (attempt.retryCount >= MAX_RETRIES) {
            Log.e(TAG, "MAX RETRIES EXCEEDED: " + endpointId);
            reconnectAttempts.remove(endpointId);
            listener.onReconnectFailed(endpointId);
            return;
        }

        long backoffMs = INITIAL_BACKOFF * (long) Math.pow(2, attempt.retryCount);
        attempt.retryCount++;
        reconnectAttempts.put(endpointId, attempt);

        Log.d(TAG, "Scheduling reconnect to " + endpointId + 
            " (attempt " + attempt.retryCount + "/" + MAX_RETRIES + 
            ") in " + backoffMs + "ms");
        
        listener.onReconnectScheduled(endpointId, attempt.retryCount);

        executor.schedule(() -> {
            if (isShutdown) {
                Log.w(TAG, "Skipping reconnect attempt - manager is shutdown");
                return;
            }

            Log.d(TAG, "RECONNECT ATTEMPT: " + endpointId);
            listener.onReconnectAttempt(endpointId, attempt.retryCount);
        }, backoffMs, TimeUnit.MILLISECONDS);
    }

    public void clearAttempts(String endpointId) {
        reconnectAttempts.remove(endpointId);
        Log.d(TAG, "Cleared reconnection attempts for: " + endpointId);
    }

    public void shutdown() {
        isShutdown = true;
        Log.d(TAG, "Shutting down ReconnectionManager");

        executor.shutdown();
        try {
            if (!executor.awaitTermination(5, TimeUnit.SECONDS)) {
                executor.shutdownNow();
            }
        } catch (InterruptedException e) {
            executor.shutdownNow();
        }

        reconnectAttempts.clear();
    }

    private static class ReconnectAttempt {
        String endpointId;
        String endpointName;
        int retryCount = 0;
        long firstAttemptTime;

        ReconnectAttempt(String endpointId, String endpointName) {
            this.endpointId = endpointId;
            this.endpointName = endpointName;
            this.firstAttemptTime = System.currentTimeMillis();
        }
    }
}