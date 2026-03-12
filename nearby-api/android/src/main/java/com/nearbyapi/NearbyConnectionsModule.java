package com.nearbyapi;

import android.Manifest;
import android.content.Context;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.google.android.gms.nearby.Nearby;
import com.google.android.gms.nearby.connection.AdvertisingOptions;
import com.google.android.gms.nearby.connection.ConnectionInfo;
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback;
import com.google.android.gms.nearby.connection.ConnectionResolution;
import com.google.android.gms.nearby.connection.ConnectionsClient;
import com.google.android.gms.nearby.connection.ConnectionsStatusCodes;
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo;
import com.google.android.gms.nearby.connection.DiscoveryOptions;
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback;
import com.google.android.gms.nearby.connection.Payload;
import com.google.android.gms.nearby.connection.PayloadCallback;
import com.google.android.gms.nearby.connection.PayloadTransferUpdate;
import com.google.android.gms.nearby.connection.Strategy;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.HashSet;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public class NearbyConnectionsModule extends ReactContextBaseJavaModule {

    private static final String TAG          = "NearbyConnections";
    private static final String SERVICE_ID   = "com.pragadeesh.ticketscanner";
    private static final Strategy STRATEGY   = Strategy.P2P_CLUSTER;

    private final ReactApplicationContext reactContext;
    private ConnectionsClient connectionsClient;
    private String localDeviceName; // ✨ Kept from previous optimization
    private boolean isModuleDestroyed = false;  // ✨ NEW - prevent operations after destroy

    // ── Track active connections ──────────────────────────────
    private final Map<String, String> connectedEndpoints = new ConcurrentHashMap<>();
    private final Object connectionLock = new Object();
    private final Set<String> connectingEndpoints = new HashSet<>();

    // ── Reliability Managers ──────────────────────────────────
    private PermissionsManager permissionsManager;
    private ConnectionTimeoutManager timeoutManager;
    private ReconnectionManager reconnectionManager;
    private HeartbeatManager heartbeatManager;
    private boolean managersInitialized = false;

    // ── Events emitted to JS ──────────────────────────────────
    private static final String EVENT_CONNECTED      = "NearbyConnected";
    private static final String EVENT_DISCONNECTED   = "NearbyDisconnected";
    private static final String EVENT_PAYLOAD        = "NearbyPayloadReceived";
    private static final String EVENT_STATUS         = "NearbyStatusChanged";
    private static final String EVENT_RECONNECT      = "NearbyReconnecting";
    private static final String EVENT_PERMISSION     = "NearbyPermissionError";
    private static final String EVENT_DEBUG          = "NearbyDebug";

    public NearbyConnectionsModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        Log.d(TAG, "📦 Module instantiated");
    }

    @NonNull
    @Override
    public String getName() {
        return "NearbyModule";
    }

    /**
     * Initialize all reliability managers (lazy initialization)
     */
    private synchronized void ensureManagersInitialized() {
        if (managersInitialized || isModuleDestroyed) {
            return;
        }

        Log.d(TAG, "🔧 Initializing managers...");

        this.permissionsManager = new PermissionsManager();
        this.timeoutManager = new ConnectionTimeoutManager();
        this.heartbeatManager = new HeartbeatManager(reactContext, new HeartbeatManager.HeartbeatListener() {
            @Override
            public void onHeartbeatTimeout(String endpointId) {
                if (!isModuleDestroyed) {
                    Log.w(TAG, "❌ Heartbeat timeout detected for: " + endpointId);
                    handleHeartbeatTimeout(endpointId);
                }
            }
        });
        this.reconnectionManager = new ReconnectionManager(reactContext, new ReconnectionManager.ReconnectionListener() {
            @Override
            public void onReconnectScheduled(String endpointId, int attempt) {
                if (!isModuleDestroyed) {
                    Log.d(TAG, "⚡ Reconnect scheduled for: " + endpointId + " (attempt " + attempt + ")");
                    emitReconnecting(endpointId, attempt);
                }
            }

            @Override
            public void onReconnectAttempt(String endpointId, int attempt) {
                if (!isModuleDestroyed) {
                    Log.d(TAG, "🔄 Attempting reconnection to: " + endpointId);
                    attemptReconnection(endpointId);
                }
            }

            @Override
            public void onReconnectFailed(String endpointId) {
                if (!isModuleDestroyed) {
                    Log.e(TAG, "❌ All reconnection attempts failed for: " + endpointId);
                    emitStatus("reconnect_failed_" + endpointId);
                }
            }
        });

        managersInitialized = true;
        Log.d(TAG, "✅ All managers initialized");
    }

    // ── Permissions ──────────────────────────────────────────
    @ReactMethod
    public void checkPermissions(Promise promise) {
        ensureManagersInitialized();
        List<String> missing = permissionsManager.getMissingPermissions(reactContext);
        com.facebook.react.bridge.WritableArray arr = Arguments.createArray();
        for (String p : missing) arr.pushString(p);
        promise.resolve(arr);
    }

    @ReactMethod
    public void requestPermissions(Promise promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                promise.resolve(true);
                return;
            }

            ensureManagersInitialized();
            List<String> missing = permissionsManager.getMissingPermissions(reactContext);
            if (missing.isEmpty()) {
                promise.resolve(true);
                return;
            }

            if (getCurrentActivity() == null) {
                promise.reject("NO_ACTIVITY", "Cannot request permissions without an activity");
                return;
            }

            String[] permissions = missing.toArray(new String[0]);
            getCurrentActivity().requestPermissions(permissions, 1234);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("PERMISSION_REQUEST_ERROR", e.getMessage());
        }
    }

    // ── Start advertising + discovering ───────────────────────
    @ReactMethod
    public void start(String deviceName, Promise promise) {
        try {
            Log.d(TAG, "🟢 Nearby service init as: " + deviceName);
            ensureManagersInitialized();
            if (!permissionsManager.hasAllNearbyPermissions(reactContext)) {
                emitPermissionError(permissionsManager.getMissingPermissions(reactContext).toString());
                promise.reject("PERMISSION_DENIED", "Missing Nearby permissions");
                return;
            }
            connectionsClient = Nearby.getConnectionsClient(reactContext);
            heartbeatManager.startHeartbeat();
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("START_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void startAdvertising(String deviceName, Promise promise) {
        try {
            this.localDeviceName = deviceName;
            if (isModuleDestroyed || connectionsClient == null) {
                promise.reject("ERROR", "Service not initialized");
                return;
            }
            startAdvertising(deviceName);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void startDiscovery(Promise promise) {
        try {
            if (isModuleDestroyed || connectionsClient == null) {
                promise.reject("ERROR", "Service not initialized");
                return;
            }
            startDiscovery();
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    // ── Stop all connections ──────────────────────────────────
    @ReactMethod
    public void stop(Promise promise) {
        try {
            if (isModuleDestroyed) {
                Log.w(TAG, "⚠️  Module already destroyed, skipping stop");
                if (promise != null) promise.resolve(true);
                return;
            }

            Log.d(TAG, "🔴 Stopping Nearby service...");

            if (connectionsClient != null) {
                // Stop discovery and advertising
                try {
                    connectionsClient.stopAdvertising();
                    Log.d(TAG, "✅ Advertising stopped");
                } catch (Exception e) {
                    Log.w(TAG, "⚠️  stopAdvertising error: " + e.getMessage());
                }

                try {
                    connectionsClient.stopDiscovery();
                    Log.d(TAG, "✅ Discovery stopped");
                } catch (Exception e) {
                    Log.w(TAG, "⚠️  stopDiscovery error: " + e.getMessage());
                }

                // Disconnect all endpoints
                Set<String> endpointsCopy = new HashSet<>(connectedEndpoints.keySet());
                for (String endpointId : endpointsCopy) {
                    try {
                        disconnectFromEndpoint(endpointId);
                    } catch (Exception e) {
                        Log.w(TAG, "⚠️  Error disconnecting " + endpointId + ": " + e.getMessage());
                    }
                }

                try {
                    connectionsClient.stopAllEndpoints();
                } catch (Exception e) {
                    Log.w(TAG, "⚠️  stopAllEndpoints error: " + e.getMessage());
                }
            }

            // Shutdown managers ONLY if initialized
            if (managersInitialized) {
                Log.d(TAG, "🔧 Shutting down managers...");
                try { heartbeatManager.shutdown(); } catch (Exception e) { Log.w(TAG, "⚠️  heartbeat shutdown: " + e.getMessage()); }
                try { timeoutManager.shutdown(); } catch (Exception e) { Log.w(TAG, "⚠️  timeout shutdown: " + e.getMessage()); }
                try { reconnectionManager.shutdown(); } catch (Exception e) { Log.w(TAG, "⚠️  reconnection shutdown: " + e.getMessage()); }
                managersInitialized = false;
            }

            connectedEndpoints.clear();
            synchronized (connectionLock) {
                connectingEndpoints.clear();
            }

            emitStatus("stopped");
            if (promise != null) {
                promise.resolve(true);
            }
            Log.d(TAG, "✅ Nearby service stopped");
        } catch (Exception e) {
            Log.e(TAG, "❌ stop error: " + e.getMessage(), e);
            if (promise != null) {
                promise.reject("STOP_ERROR", e.getMessage());
            }
        }
    }

    // ── Broadcast payload to ALL connected peers ──────────────
    @ReactMethod
    public void broadcastPayload(String jsonPayload, Promise promise) {
        if (isModuleDestroyed) {
            promise.reject("MODULE_DESTROYED", "Module has been destroyed");
            return;
        }

        if (connectionsClient == null || connectedEndpoints.isEmpty()) {
            Log.w(TAG, "⚠️  No connected devices to broadcast to");
            promise.resolve(false);
            return;
        }
        try {
            byte[] bytes   = jsonPayload.getBytes(StandardCharsets.UTF_8);
            Payload payload = Payload.fromBytes(bytes);

            Log.d(TAG, "📤 Broadcasting to " + connectedEndpoints.size() + " devices");

            for (String endpointId : connectedEndpoints.keySet()) {
                try {
                    connectionsClient.sendPayload(endpointId, payload);
                    Log.d(TAG, "   ✅ Sent to: " + endpointId);
                } catch (Exception e) {
                    Log.w(TAG, "   ❌ Failed to send to " + endpointId + ": " + e.getMessage());
                }
            }
            promise.resolve(true);
        } catch (Exception e) {
            Log.e(TAG, "❌ broadcast error: " + e.getMessage(), e);
            promise.reject("BROADCAST_ERROR", e.getMessage());
        }
    }

    // ── Get connected device count ────────────────────────────
    @ReactMethod
    public void getConnectedDevices(Promise promise) {
        if (isModuleDestroyed) {
            promise.resolve(Arguments.createArray());
            return;
        }

        com.facebook.react.bridge.WritableArray arr = Arguments.createArray();
        for (Map.Entry<String, String> entry : connectedEndpoints.entrySet()) {
            WritableMap device = Arguments.createMap();
            device.putString("endpointId", entry.getKey());
            device.putString("deviceName", entry.getValue());
            arr.pushMap(device);
        }
        promise.resolve(arr);
    }

    // ── Get Diagnostics ─────────────────────────────────────
    @ReactMethod
    public void getDiagnostics(Promise promise) {
        if (isModuleDestroyed) {
            promise.reject("MODULE_DESTROYED", "Module has been destroyed");
            return;
        }

        try {
            ensureManagersInitialized();

            WritableMap diagnostics = Arguments.createMap();

            diagnostics.putString("device_model", Build.MODEL);
            diagnostics.putInt("android_version", Build.VERSION.SDK_INT);

            diagnostics.putBoolean("bluetooth_scan", 
                ContextCompat.checkSelfPermission(reactContext, 
                    Manifest.permission.BLUETOOTH_SCAN) == android.content.pm.PackageManager.PERMISSION_GRANTED);
            diagnostics.putBoolean("bluetooth_connect",
                ContextCompat.checkSelfPermission(reactContext,
                    Manifest.permission.BLUETOOTH_CONNECT) == android.content.pm.PackageManager.PERMISSION_GRANTED);
            diagnostics.putBoolean("location",
                ContextCompat.checkSelfPermission(reactContext,
                    Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED);

            diagnostics.putInt("connected_devices", connectedEndpoints.size());
            diagnostics.putInt("connecting_devices", connectingEndpoints.size());
            diagnostics.putString("service_id", SERVICE_ID);
            diagnostics.putString("strategy", STRATEGY.toString());

            Log.d(TAG, "📊 Diagnostics: " + diagnostics.toString());
            promise.resolve(diagnostics);
        } catch (Exception e) {
            promise.reject("DIAGNOSTIC_ERROR", e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────
    //  ADVERTISING
    // ─────────────────────────────────────────────────────────
    private void startAdvertising(String deviceName) {
        if (connectionsClient == null || isModuleDestroyed) {
            Log.e(TAG, "❌ Cannot advertise - connectionsClient null or module destroyed");
            return;
        }

        AdvertisingOptions options = new AdvertisingOptions.Builder()
                .setStrategy(STRATEGY)
                .build();

        connectionsClient.startAdvertising(
                deviceName,
                SERVICE_ID,
                connectionLifecycleCallback,
                options
        ).addOnSuccessListener(unused -> {
            if (!isModuleDestroyed) {
                Log.d(TAG, "✅ Advertising started successfully");
                emitDebug("Advertising started as: " + deviceName);
            }
        }).addOnFailureListener(e -> {
            if (!isModuleDestroyed) {
                Log.e(TAG, "❌ Advertising failed: " + e.getMessage());
                emitDebug("Advertising failed: " + e.getMessage());
            }
        });
    }

    // ─────────────────────────────────────────────────────────
    //  DISCOVERY
    // ─────────────────────────────────────────────────────────
    private void startDiscovery() {
        if (connectionsClient == null || isModuleDestroyed) {
            Log.e(TAG, "❌ Cannot discover - connectionsClient null or module destroyed");
            return;
        }

        DiscoveryOptions options = new DiscoveryOptions.Builder()
                .setStrategy(STRATEGY)
                .build();

        connectionsClient.startDiscovery(
                SERVICE_ID,
                endpointDiscoveryCallback,
                options
        ).addOnSuccessListener(unused -> {
            if (!isModuleDestroyed) {
                Log.d(TAG, "✅ Discovery started successfully");
                emitDebug("Discovery started. Scanning for nearby devices...");
            }
        }).addOnFailureListener(e -> {
            if (!isModuleDestroyed) {
                Log.e(TAG, "❌ Discovery failed: " + e.getMessage());
                emitDebug("Discovery failed: " + e.getMessage());
            }
        });
    }

    // ─────────────────────────────────────────────────────────
    //  CONNECTION LIFECYCLE WITH RELIABILITY
    // ─────────────────────────────────────────────────────────
    private final ConnectionLifecycleCallback connectionLifecycleCallback =
            new ConnectionLifecycleCallback() {

        @Override
        public void onConnectionInitiated(@NonNull String endpointId,
                                          @NonNull ConnectionInfo connectionInfo) {
            if (isModuleDestroyed) return;

            Log.d(TAG, "🔗 Connection initiated: " + endpointId
                    + " (" + connectionInfo.getEndpointName() + ")");

            // Start timeout moved to request phase for reliability, but we keep the acceptance logic here
            try {
                Log.d(TAG, "👍 Accepting connection from: " + endpointId);
                connectionsClient.acceptConnection(endpointId, payloadCallback);
            } catch (Exception e) {
                Log.e(TAG, "❌ acceptConnection error: " + e.getMessage());
                timeoutManager.cancelTimeout(endpointId);
            }
        }

        @Override
        public void onConnectionResult(@NonNull String endpointId,
                                       @NonNull ConnectionResolution result) {
            if (isModuleDestroyed) return;

            synchronized (connectionLock) {
                connectingEndpoints.remove(endpointId);
            }

            timeoutManager.cancelTimeout(endpointId);

            if (result.getStatus().getStatusCode() == ConnectionsStatusCodes.STATUS_OK) {
                String deviceName = result.getStatus().getStatusMessage() != null
                        ? result.getStatus().getStatusMessage()
                        : endpointId;

                connectedEndpoints.put(endpointId, deviceName);
                heartbeatManager.startHeartbeatForEndpoint(endpointId);
                reconnectionManager.clearAttempts(endpointId);

                Log.d(TAG, "✅ CONNECTION ESTABLISHED: " + endpointId);
                emitDebug("Connected to: " + deviceName);
                emitConnected(endpointId, deviceName);
            } else {
                Log.e(TAG, "❌ Connection failed: " + endpointId
                        + " - " + result.getStatus().getStatusMessage());
                emitDebug("Connection failed: " + result.getStatus().getStatusMessage());
                scheduleReconnection(endpointId, 
                    result.getStatus().getStatusMessage() != null 
                        ? result.getStatus().getStatusMessage() 
                        : "Unknown");
            }
        }

        @Override
        public void onDisconnected(@NonNull String endpointId) {
            if (isModuleDestroyed) return;

            String name = connectedEndpoints.remove(endpointId);
            String deviceName = name != null ? name : endpointId;

            Log.d(TAG, "❌ DISCONNECTED: " + endpointId);
            emitDebug("Disconnected from: " + deviceName);

            heartbeatManager.stopHeartbeatForEndpoint(endpointId);
            timeoutManager.cancelTimeout(endpointId);
            synchronized (connectionLock) {
                connectingEndpoints.remove(endpointId);
            }

            emitDisconnected(endpointId, deviceName);
            scheduleReconnection(endpointId, deviceName);
        }
    };

    // ─────────────────────────────────────────────────────────
    //  ENDPOINT DISCOVERY
    // ─────────────────────────────────────────────────────────
    private final EndpointDiscoveryCallback endpointDiscoveryCallback =
            new EndpointDiscoveryCallback() {

        @Override
        public void onEndpointFound(@NonNull String endpointId,
                                    @NonNull DiscoveredEndpointInfo info) {
            if (isModuleDestroyed) return;

            Log.d(TAG, "🔍 ENDPOINT DISCOVERED:");
            Log.d(TAG, "   Endpoint ID: " + endpointId);
            Log.d(TAG, "   Device Name: " + info.getEndpointName());
            emitDebug("Found device: " + info.getEndpointName());

            synchronized (connectionLock) {
                if (connectingEndpoints.contains(endpointId) || connectedEndpoints.containsKey(endpointId)) {
                    Log.w(TAG, "⚠️  Already connecting/connected to: " + endpointId);
                    return;
                }
            }

            String remoteEndpointName = info.getEndpointName();

            // ✨ THE TIE-BREAKER: Prevent symmetric connection collisions
            // Only initiate if our local name is lexicographically greater than the remote name.
            if (localDeviceName != null && localDeviceName.compareTo(remoteEndpointName) > 0) {
                synchronized (connectionLock) {
                    connectingEndpoints.add(endpointId);
                }
                Log.d(TAG, "⚖️ [Tie-Breaker] I am greater (" + localDeviceName + " > " + remoteEndpointName + "). Initiating connection.");
                requestConnection(endpointId, remoteEndpointName);
            } else {
                Log.d(TAG, "⚖️ [Tie-Breaker] They are greater or equal. Waiting for " + remoteEndpointName + " to connect to me.");
                // We do nothing. Their requestConnection() will trigger our onConnectionInitiated().
            }
        }

        @Override
        public void onEndpointLost(@NonNull String endpointId) {
            if (isModuleDestroyed) return;

            Log.d(TAG, "👋 Endpoint lost: " + endpointId);
            connectedEndpoints.remove(endpointId);
            synchronized (connectionLock) {
                connectingEndpoints.remove(endpointId);
            }
        }
    };

    // ─────────────────────────────────────────────────────────
    //  REQUEST CONNECTION (✨ Kept reliability fixes)
    // ─────────────────────────────────────────────────────────
    private void requestConnection(String endpointId, String endpointName) {
        if (connectionsClient == null || isModuleDestroyed) {
            Log.e(TAG, "❌ Cannot request connection - connectionsClient null or module destroyed");
            return;
        }

        try {
            Log.d(TAG, "📞 Initiating connection request...");
            connectionsClient.requestConnection(
                    localDeviceName != null ? localDeviceName : Build.MODEL,
                    endpointId,
                    connectionLifecycleCallback
            ).addOnSuccessListener(unused -> {
                if (!isModuleDestroyed) {
                    Log.d(TAG, "✅ Connection request sent to: " + endpointId);
                    // ✨ Early timeout start
                    timeoutManager.startConnectionTimeout(endpointId, () -> {
                        if (!isModuleDestroyed) {
                            Log.w(TAG, "⏱️  Connection timeout triggered for: " + endpointId);
                            emitDebug("Connection timeout for: " + endpointId);
                            synchronized (connectionLock) {
                                connectingEndpoints.remove(endpointId);
                            }
                            scheduleReconnection(endpointId, endpointName);
                        }
                    });
                }
            }).addOnFailureListener(e -> {
                if (!isModuleDestroyed) {
                    Log.w(TAG, "⚠️  requestConnection failed for " + endpointId);
                    Log.w(TAG, "   Error: " + e.getMessage());
                    emitDebug("Connection request failed: " + e.getMessage());
                    synchronized (connectionLock) {
                        connectingEndpoints.remove(endpointId);
                    }
                    scheduleReconnection(endpointId, endpointName);
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "❌ requestConnection exception: " + e.getMessage(), e);
            emitDebug("Connection request exception: " + e.getMessage());
            synchronized (connectionLock) {
                connectingEndpoints.remove(endpointId);
            }
            scheduleReconnection(endpointId, endpointName);
        }
    }

    // ─────────────────────────────────────────────────────────
    //  RECONNECTION & HEARTBEAT HANDLING
    // ─────────────────────────────────────────────────────────
    private void scheduleReconnection(String endpointId, String endpointName) {
        if (!isModuleDestroyed && managersInitialized) {
            reconnectionManager.scheduleReconnect(endpointId, endpointName);
        }
    }

    private void attemptReconnection(String endpointId) {
        if (!isModuleDestroyed) {
            String endpointName = connectedEndpoints.getOrDefault(endpointId, endpointId);
            requestConnection(endpointId, endpointName);
        }
    }

    private void handleHeartbeatTimeout(String endpointId) {
        if (!isModuleDestroyed && connectionsClient != null) {
            try {
                connectionsClient.disconnectFromEndpoint(endpointId);
            } catch (Exception e) {
                Log.e(TAG, "❌ Disconnect error: " + e.getMessage());
            }
        }
    }

    private void disconnectFromEndpoint(String endpointId) {
        if (!isModuleDestroyed) {
            try {
                if (managersInitialized) {
                    heartbeatManager.stopHeartbeatForEndpoint(endpointId);
                    timeoutManager.cancelTimeout(endpointId);
                    reconnectionManager.clearAttempts(endpointId);
                }

                if (connectionsClient != null) {
                    connectionsClient.disconnectFromEndpoint(endpointId);
                }
            } catch (Exception e) {
                Log.e(TAG, "❌ Error disconnecting from endpoint: " + e.getMessage());
            }
        }
    }

    // ─────────────────────────────────────────────────────────
    //  PAYLOAD RECEIVED
    // ─────────────────────────────────────────────────────────
    private final PayloadCallback payloadCallback = new PayloadCallback() {

        @Override
        public void onPayloadReceived(@NonNull String endpointId,
                                      @NonNull Payload payload) {
            if (isModuleDestroyed) return;

            if (payload.getType() == Payload.Type.BYTES && payload.asBytes() != null) {
                byte[] data = payload.asBytes();

                if (data.length == 0 || (data.length == 1 && data[0] == 0x00)) {
                    heartbeatManager.recordHeartbeatReceived(endpointId);
                    Log.d(TAG, "💓 Heartbeat received from: " + endpointId);
                } else {
                    String json = new String(data, StandardCharsets.UTF_8);
                    Log.d(TAG, "📨 Payload received from " + endpointId);
                    emitPayload(endpointId, json);
                }
            }
        }

        @Override
        public void onPayloadTransferUpdate(@NonNull String endpointId,
                                            @NonNull PayloadTransferUpdate update) {
            // No-op
        }
    };

    // ─────────────────────────────────────────────────────────
    //  EMIT TO JS
    // ─────────────────────────────────────────────────────────
    private void emitConnected(String endpointId, String deviceName) {
        WritableMap map = Arguments.createMap();
        map.putString("endpointId", endpointId);
        map.putString("deviceName", deviceName);
        emit(EVENT_CONNECTED, map);
    }

    private void emitDisconnected(String endpointId, String deviceName) {
        WritableMap map = Arguments.createMap();
        map.putString("endpointId", endpointId);
        map.putString("deviceName", deviceName);
        emit(EVENT_DISCONNECTED, map);
    }

    private void emitPayload(String endpointId, String json) {
        WritableMap map = Arguments.createMap();
        map.putString("endpointId", endpointId);
        map.putString("payload", json);
        emit(EVENT_PAYLOAD, map);
    }

    private void emitReconnecting(String endpointId, int attempt) {
        WritableMap map = Arguments.createMap();
        map.putString("endpointId", endpointId);
        map.putInt("attempt", attempt);
        emit(EVENT_RECONNECT, map);
    }

    private void emitPermissionError(String missingPermissions) {
        WritableMap map = Arguments.createMap();
        map.putString("missing", missingPermissions);
        emit(EVENT_PERMISSION, map);
    }

    private void emitStatus(String status) {
        WritableMap map = Arguments.createMap();
        map.putString("status", status);
        emit(EVENT_STATUS, map);
    }

    private void emitDebug(String message) {
        WritableMap map = Arguments.createMap();
        map.putString("message", message);
        emit(EVENT_DEBUG, map);
    }

    private void emit(String event, WritableMap data) {
        if (isModuleDestroyed) return;

        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(event, data);
        } catch (Exception e) {
            Log.e(TAG, "❌ Failed to emit event " + event + ": " + e.getMessage());
        }
    }

    // Required for addListener/removeListeners (RN 0.65+)
    @ReactMethod public void addListener(String eventName) {}
    @ReactMethod public void removeListeners(Integer count) {}

    /**
     * Clean up when module is destroyed
     */
    @Override
    public void onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy();
        Log.d(TAG, "🔴 Module destroy called");

        isModuleDestroyed = true;  // ✨ Set flag FIRST

        try {
            stop(null);  // This will be safe now due to isModuleDestroyed flag
        } catch (Exception e) {
            Log.e(TAG, "❌ Error during cleanup: " + e.getMessage());
        }

        Log.d(TAG, "✅ Module destroyed completely");
    }
}