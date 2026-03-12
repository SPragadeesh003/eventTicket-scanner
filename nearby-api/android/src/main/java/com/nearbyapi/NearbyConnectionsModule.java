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
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

public class NearbyConnectionsModule extends ReactContextBaseJavaModule {

    private static final String TAG        = "NearbyConnections";
    private static final String SERVICE_ID = "com.pragadeesh.ticketscanner";
    private static final Strategy STRATEGY = Strategy.P2P_CLUSTER;

    private final ReactApplicationContext reactContext;
    private ConnectionsClient connectionsClient;
    private String localDeviceName;
    private volatile boolean isModuleDestroyed = false;

    // ── Active connection tracking ────────────────────────────────────────────
    // endpointId → deviceName (only entries that are fully CONNECTED)
    private final Map<String, String> connectedEndpoints = new ConcurrentHashMap<>();

    // FIX #1: Persistent name cache so reconnection knows device names
    // even after connectedEndpoints.remove() is called on disconnect
    private final Map<String, String> endpointNameCache = new ConcurrentHashMap<>();

    // FIX #2: Name resolved during onConnectionInitiated (before result arrives)
    private final Map<String, String> pendingConnectionNames = new ConcurrentHashMap<>();

    // FIX #3: ConcurrentHashMap.newKeySet() — fully thread-safe, no synchronized blocks needed
    private final Set<String> connectingEndpoints = ConcurrentHashMap.newKeySet();

    // ── Reliability managers ──────────────────────────────────────────────────
    private PermissionsManager      permissionsManager;
    private ConnectionTimeoutManager timeoutManager;
    private ReconnectionManager     reconnectionManager;
    private HeartbeatManager        heartbeatManager;
    private volatile boolean        managersInitialized = false;

    // ── JS event names ────────────────────────────────────────────────────────
    private static final String EVENT_CONNECTED    = "NearbyConnected";
    private static final String EVENT_DISCONNECTED = "NearbyDisconnected";
    private static final String EVENT_PAYLOAD      = "NearbyPayloadReceived";
    private static final String EVENT_STATUS       = "NearbyStatusChanged";
    private static final String EVENT_RECONNECT    = "NearbyReconnecting";
    private static final String EVENT_PERMISSION   = "NearbyPermissionError";
    private static final String EVENT_DEBUG        = "NearbyDebug";
    private static final String EVENT_DEVICE_FOUND = "NearbyDeviceFound";

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

    // ─────────────────────────────────────────────────────────────────────────
    //  MANAGER INITIALIZATION
    // ─────────────────────────────────────────────────────────────────────────
    private synchronized void ensureManagersInitialized() {
        if (managersInitialized || isModuleDestroyed) return;

        Log.d(TAG, "🔧 Initializing managers...");

        permissionsManager = new PermissionsManager();
        timeoutManager     = new ConnectionTimeoutManager();

        // FIX #4: Pass connectedEndpoints so HeartbeatManager skips dead peers
        heartbeatManager = new HeartbeatManager(
            reactContext,
            connectedEndpoints,
            endpointId -> {
                if (!isModuleDestroyed) {
                    Log.w(TAG, "❌ Heartbeat timeout: " + endpointId);
                    handleHeartbeatTimeout(endpointId);
                }
            }
        );

        reconnectionManager = new ReconnectionManager(
            reactContext,
            new ReconnectionManager.ReconnectionListener() {
                @Override
                public void onReconnectScheduled(String endpointId, int attempt) {
                    if (!isModuleDestroyed) emitReconnecting(endpointId, attempt);
                }

                @Override
                public void onReconnectAttempt(String endpointId, int attempt) {
                    if (!isModuleDestroyed) attemptReconnection(endpointId);
                }

                @Override
                public void onReconnectFailed(String endpointId) {
                    if (!isModuleDestroyed) {
                        Log.e(TAG, "❌ All reconnection attempts failed: " + endpointId);
                        // Clean up name cache for permanently lost peer
                        endpointNameCache.remove(endpointId);
                        emitStatus("reconnect_failed_" + endpointId);
                    }
                }
            }
        );

        managersInitialized = true;
        Log.d(TAG, "✅ All managers initialized");
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  PERMISSIONS
    // ─────────────────────────────────────────────────────────────────────────
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
            getCurrentActivity().requestPermissions(missing.toArray(new String[0]), 1234);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("PERMISSION_REQUEST_ERROR", e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  START / STOP
    // ─────────────────────────────────────────────────────────────────────────
    @ReactMethod
    public void start(String deviceName, Promise promise) {
        try {
            Log.d(TAG, "🟢 Nearby init as: " + deviceName);
            ensureManagersInitialized();

            if (!permissionsManager.hasAllNearbyPermissions(reactContext)) {
                List<String> missing = permissionsManager.getMissingPermissions(reactContext);
                emitPermissionError(missing.toString());
                promise.reject("PERMISSION_DENIED", "Missing Nearby permissions: " + missing);
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
                promise.reject("ERROR", "Service not initialized — call start() first");
                return;
            }
            startAdvertisingInternal(deviceName);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void startDiscovery(Promise promise) {
        try {
            if (isModuleDestroyed || connectionsClient == null) {
                promise.reject("ERROR", "Service not initialized — call start() first");
                return;
            }
            startDiscoveryInternal();
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void stop(Promise promise) {
        try {
            if (isModuleDestroyed) {
                Log.w(TAG, "⚠️ Module already destroyed");
                if (promise != null) promise.resolve(true);
                return;
            }

            Log.d(TAG, "🔴 Stopping Nearby service...");

            if (connectionsClient != null) {
                try { connectionsClient.stopAdvertising(); }
                catch (Exception e) { Log.w(TAG, "stopAdvertising: " + e.getMessage()); }

                try { connectionsClient.stopDiscovery(); }
                catch (Exception e) { Log.w(TAG, "stopDiscovery: " + e.getMessage()); }

                for (String endpointId : connectedEndpoints.keySet()) {
                    try { disconnectFromEndpoint(endpointId); }
                    catch (Exception e) { Log.w(TAG, "disconnect " + endpointId + ": " + e.getMessage()); }
                }

                try { connectionsClient.stopAllEndpoints(); }
                catch (Exception e) { Log.w(TAG, "stopAllEndpoints: " + e.getMessage()); }
            }

            if (managersInitialized) {
                try { heartbeatManager.shutdown(); }    catch (Exception e) { Log.w(TAG, e.getMessage()); }
                try { timeoutManager.shutdown(); }      catch (Exception e) { Log.w(TAG, e.getMessage()); }
                try { reconnectionManager.shutdown(); } catch (Exception e) { Log.w(TAG, e.getMessage()); }
                managersInitialized = false;
            }

            connectedEndpoints.clear();
            connectingEndpoints.clear();
            pendingConnectionNames.clear();
            // Keep endpointNameCache — useful if service restarts and finds same peers

            emitStatus("stopped");
            if (promise != null) promise.resolve(true);
            Log.d(TAG, "✅ Nearby service stopped");
        } catch (Exception e) {
            Log.e(TAG, "❌ stop error: " + e.getMessage(), e);
            if (promise != null) promise.reject("STOP_ERROR", e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  ADVERTISING
    // ─────────────────────────────────────────────────────────────────────────
    private void startAdvertisingInternal(String deviceName) {
        if (connectionsClient == null || isModuleDestroyed) return;

        AdvertisingOptions options = new AdvertisingOptions.Builder()
                .setStrategy(STRATEGY)
                .build();

        connectionsClient.startAdvertising(
                deviceName, SERVICE_ID, connectionLifecycleCallback, options
        ).addOnSuccessListener(unused -> {
            if (!isModuleDestroyed) {
                Log.d(TAG, "✅ Advertising started");
                emitDebug("Advertising started as: " + deviceName);
            }
        }).addOnFailureListener(e -> {
            if (isModuleDestroyed) return;

            if (e instanceof com.google.android.gms.common.api.ApiException) {
                int code = ((com.google.android.gms.common.api.ApiException) e).getStatusCode();
                if (code == ConnectionsStatusCodes.STATUS_ALREADY_ADVERTISING) {
                    Log.d(TAG, "✅ Already advertising");
                    return;
                }
            }

            Log.e(TAG, "❌ Advertising failed: " + e.getMessage());
            emitDebug("Advertising failed: " + e.getMessage() + ". Retrying in 2s...");
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                if (!isModuleDestroyed) startAdvertisingInternal(deviceName);
            }, 2000);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  DISCOVERY
    // ─────────────────────────────────────────────────────────────────────────
    private void startDiscoveryInternal() {
        if (connectionsClient == null || isModuleDestroyed) return;

        DiscoveryOptions options = new DiscoveryOptions.Builder()
                .setStrategy(STRATEGY)
                .build();

        connectionsClient.startDiscovery(
                SERVICE_ID, endpointDiscoveryCallback, options
        ).addOnSuccessListener(unused -> {
            if (!isModuleDestroyed) {
                Log.d(TAG, "✅ Discovery started");
                emitDebug("Discovery started. Scanning for nearby devices...");
            }
        }).addOnFailureListener(e -> {
            if (isModuleDestroyed) return;

            if (e instanceof com.google.android.gms.common.api.ApiException) {
                int code = ((com.google.android.gms.common.api.ApiException) e).getStatusCode();
                if (code == ConnectionsStatusCodes.STATUS_ALREADY_DISCOVERING) {
                    Log.d(TAG, "✅ Already discovering");
                    return;
                }
            }

            Log.e(TAG, "❌ Discovery failed: " + e.getMessage());
            emitDebug("Discovery failed: " + e.getMessage() + ". Retrying in 2s...");
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                if (!isModuleDestroyed) startDiscoveryInternal();
            }, 2000);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  CONNECTION LIFECYCLE
    // ─────────────────────────────────────────────────────────────────────────
    private final ConnectionLifecycleCallback connectionLifecycleCallback =
            new ConnectionLifecycleCallback() {

        @Override
        public void onConnectionInitiated(@NonNull String endpointId,
                                          @NonNull ConnectionInfo connectionInfo) {
            if (isModuleDestroyed) return;

            String remoteName = connectionInfo.getEndpointName();
            Log.d(TAG, "🔗 Connection initiated: " + endpointId + " (" + remoteName + ")");

            // FIX #2: Store name NOW — before result arrives — so we have it in onConnectionResult
            pendingConnectionNames.put(endpointId, remoteName);
            // Also update persistent cache
            endpointNameCache.put(endpointId, remoteName);

            try {
                connectionsClient.acceptConnection(endpointId, payloadCallback);
            } catch (Exception e) {
                Log.e(TAG, "❌ acceptConnection error: " + e.getMessage());
                timeoutManager.cancelTimeout(endpointId);
                pendingConnectionNames.remove(endpointId);
            }
        }

        @Override
        public void onConnectionResult(@NonNull String endpointId,
                                       @NonNull ConnectionResolution result) {
            if (isModuleDestroyed) return;

            connectingEndpoints.remove(endpointId); // FIX #3: no synchronized needed
            timeoutManager.cancelTimeout(endpointId);

            // FIX #2: Get name from pendingConnectionNames, fall back to cache
            String deviceName = pendingConnectionNames.remove(endpointId);
            if (deviceName == null) {
                deviceName = endpointNameCache.getOrDefault(endpointId, endpointId);
            }

            if (result.getStatus().getStatusCode() == ConnectionsStatusCodes.STATUS_OK) {
                connectedEndpoints.put(endpointId, deviceName);
                heartbeatManager.startHeartbeatForEndpoint(endpointId);
                reconnectionManager.clearAttempts(endpointId);

                Log.d(TAG, "✅ Connected: " + deviceName + " (" + connectedEndpoints.size() + " total)");
                emitDebug("Connected to: " + deviceName);
                emitConnected(endpointId, deviceName);
            } else {
                int statusCode = result.getStatus().getStatusCode();
                Log.e(TAG, "❌ Connection failed: " + deviceName + " code: " + statusCode);
                emitDebug("Connection failed: " + deviceName + " (" + statusCode + ")");
                scheduleReconnection(endpointId, deviceName);
            }
        }

        @Override
        public void onDisconnected(@NonNull String endpointId) {
            if (isModuleDestroyed) return;

            // FIX #1: name stays in endpointNameCache even after removal here
            String deviceName = connectedEndpoints.remove(endpointId);
            if (deviceName == null) deviceName = endpointNameCache.getOrDefault(endpointId, endpointId);

            Log.d(TAG, "❌ Disconnected: " + deviceName);
            heartbeatManager.stopHeartbeatForEndpoint(endpointId);
            timeoutManager.cancelTimeout(endpointId);
            connectingEndpoints.remove(endpointId); // FIX #3

            emitDisconnected(endpointId, deviceName);
            scheduleReconnection(endpointId, deviceName);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    //  ENDPOINT DISCOVERY CALLBACK
    // ─────────────────────────────────────────────────────────────────────────
    private final EndpointDiscoveryCallback endpointDiscoveryCallback =
            new EndpointDiscoveryCallback() {

        @Override
        public void onEndpointFound(@NonNull String endpointId,
                                    @NonNull DiscoveredEndpointInfo info) {
            if (isModuleDestroyed) return;

            String remoteName = info.getEndpointName();

            // Self-filter
            if (localDeviceName != null && localDeviceName.equals(remoteName)) {
                Log.d(TAG, "📵 [Self-Filter] Ignoring self: " + remoteName);
                return;
            }

            // Persist name immediately on discovery
            endpointNameCache.put(endpointId, remoteName);

            Log.d(TAG, "🔍 Endpoint found: " + remoteName + " (" + endpointId + ")");
            emitDebug("Found device: " + remoteName);

            // Emit to JS for UI device list
            WritableMap found = Arguments.createMap();
            found.putString("endpointId", endpointId);
            found.putString("deviceName", remoteName);
            emit(EVENT_DEVICE_FOUND, found);

            // Skip if already connected (purge stale state first)
            if (connectedEndpoints.containsKey(endpointId)) {
                Log.w(TAG, "⚠️ Already connected to " + remoteName + ", purging stale state");
                connectedEndpoints.remove(endpointId);
                heartbeatManager.stopHeartbeatForEndpoint(endpointId);
            }

            // Skip if already connecting — FIX #3: no synchronized block needed
            if (connectingEndpoints.contains(endpointId)) {
                Log.w(TAG, "⚠️ Already connecting to: " + remoteName);
                return;
            }

            // Tie-breaker: lexicographically greater name initiates connection
            // Prevents both devices simultaneously calling requestConnection to each other
            if (localDeviceName != null && localDeviceName.compareTo(remoteName) > 0) {
                connectingEndpoints.add(endpointId);
                Log.d(TAG, "⚖️ I am greater (" + localDeviceName + " > " + remoteName + "). Initiating.");
                requestConnectionInternal(endpointId, remoteName);
            } else {
                Log.d(TAG, "⚖️ Waiting for " + remoteName + " to connect to me.");
            }
        }

        @Override
        public void onEndpointLost(@NonNull String endpointId) {
            if (isModuleDestroyed) return;
            String name = endpointNameCache.getOrDefault(endpointId, endpointId);
            Log.d(TAG, "👋 Endpoint lost: " + name);
            connectedEndpoints.remove(endpointId);
            connectingEndpoints.remove(endpointId); // FIX #3
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    //  REQUEST CONNECTION (exposed to JS for manual connect)
    // ─────────────────────────────────────────────────────────────────────────
    @ReactMethod
    public void requestConnection(String endpointId, String endpointName, Promise promise) {
        if (isModuleDestroyed || connectionsClient == null) {
            if (promise != null) promise.resolve(false);
            return;
        }
        // Update name cache from JS call too
        if (endpointName != null) endpointNameCache.put(endpointId, endpointName);
        requestConnectionInternal(endpointId, endpointName != null ? endpointName : endpointId);
        if (promise != null) promise.resolve(true);
    }

    private void requestConnectionInternal(String endpointId, String endpointName) {
        if (connectionsClient == null || isModuleDestroyed) return;

        String myName = localDeviceName != null ? localDeviceName : android.os.Build.MODEL;

        try {
            connectionsClient.requestConnection(myName, endpointId, connectionLifecycleCallback)
                .addOnSuccessListener(unused -> {
                    if (isModuleDestroyed) return;
                    Log.d(TAG, "✅ Connection request sent to: " + endpointName);

                    timeoutManager.startConnectionTimeout(endpointId, () -> {
                        if (!isModuleDestroyed) {
                            Log.w(TAG, "⏱️ Connection timeout: " + endpointId);
                            connectingEndpoints.remove(endpointId);
                            scheduleReconnection(endpointId, endpointName);
                        }
                    });
                })
                .addOnFailureListener(e -> {
                    if (isModuleDestroyed) return;

                    if (e instanceof com.google.android.gms.common.api.ApiException) {
                        int code = ((com.google.android.gms.common.api.ApiException) e).getStatusCode();

                        if (code == ConnectionsStatusCodes.STATUS_ALREADY_CONNECTED_TO_ENDPOINT) {
                            Log.d(TAG, "♻️ Already connected to " + endpointName + " — purging stale state");
                            connectionsClient.disconnectFromEndpoint(endpointId);
                            connectedEndpoints.remove(endpointId);
                        }

                        if (code == ConnectionsStatusCodes.STATUS_ALREADY_ADVERTISING
                                || code == ConnectionsStatusCodes.STATUS_ALREADY_DISCOVERING) {
                            Log.d(TAG, "ℹ️ Status code " + code + " — non-fatal, skipping reconnect");
                            connectingEndpoints.remove(endpointId);
                            return;
                        }
                    }

                    Log.w(TAG, "⚠️ requestConnection failed for " + endpointName + ": " + e.getMessage());
                    connectingEndpoints.remove(endpointId);
                    scheduleReconnection(endpointId, endpointName);
                });
        } catch (Exception e) {
            Log.e(TAG, "❌ requestConnectionInternal exception: " + e.getMessage(), e);
            connectingEndpoints.remove(endpointId);
            scheduleReconnection(endpointId, endpointName);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  BROADCAST PAYLOAD
    // ─────────────────────────────────────────────────────────────────────────
    @ReactMethod
    public void broadcastPayload(String jsonPayload, Promise promise) {
        if (isModuleDestroyed) {
            promise.reject("MODULE_DESTROYED", "Module has been destroyed");
            return;
        }
        if (connectionsClient == null || connectedEndpoints.isEmpty()) {
            Log.w(TAG, "⚠️ No connected devices to broadcast to");
            promise.resolve(false);
            return;
        }

        try {
            byte[]  bytes   = jsonPayload.getBytes(StandardCharsets.UTF_8);
            Payload payload = Payload.fromBytes(bytes);

            Log.d(TAG, "📤 Broadcasting to " + connectedEndpoints.size() + " devices");

            for (Map.Entry<String, String> entry : connectedEndpoints.entrySet()) {
                try {
                    connectionsClient.sendPayload(entry.getKey(), payload);
                    Log.d(TAG, "   ✅ Sent to: " + entry.getValue());
                } catch (Exception e) {
                    Log.w(TAG, "   ❌ Failed to send to " + entry.getValue() + ": " + e.getMessage());
                }
            }
            promise.resolve(true);
        } catch (Exception e) {
            Log.e(TAG, "❌ broadcast error: " + e.getMessage(), e);
            promise.reject("BROADCAST_ERROR", e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  GET CONNECTED DEVICES
    // ─────────────────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────────────────
    //  DIAGNOSTICS
    // ─────────────────────────────────────────────────────────────────────────
    @ReactMethod
    public void getDiagnostics(Promise promise) {
        if (isModuleDestroyed) {
            promise.reject("MODULE_DESTROYED", "Module has been destroyed");
            return;
        }
        try {
            ensureManagersInitialized();
            WritableMap d = Arguments.createMap();
            d.putString("device_model",    android.os.Build.MODEL);
            d.putInt("android_version",    android.os.Build.VERSION.SDK_INT);
            d.putString("local_name",      localDeviceName != null ? localDeviceName : "");
            d.putInt("connected_devices",  connectedEndpoints.size());
            d.putInt("connecting_devices", connectingEndpoints.size());
            d.putInt("cached_names",       endpointNameCache.size());
            d.putString("service_id",      SERVICE_ID);
            d.putString("strategy",        STRATEGY.toString());
            d.putBoolean("bt_scan",
                ContextCompat.checkSelfPermission(reactContext, Manifest.permission.BLUETOOTH_SCAN)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED);
            d.putBoolean("bt_advertise",
                ContextCompat.checkSelfPermission(reactContext, Manifest.permission.BLUETOOTH_ADVERTISE)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED);
            d.putBoolean("bt_connect",
                ContextCompat.checkSelfPermission(reactContext, Manifest.permission.BLUETOOTH_CONNECT)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED);
            d.putBoolean("location",
                ContextCompat.checkSelfPermission(reactContext, Manifest.permission.ACCESS_FINE_LOCATION)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED);
            Log.d(TAG, "📊 Diagnostics: " + d.toString());
            promise.resolve(d);
        } catch (Exception e) {
            promise.reject("DIAGNOSTIC_ERROR", e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  RECONNECTION & HEARTBEAT HELPERS
    // ─────────────────────────────────────────────────────────────────────────
    private void scheduleReconnection(String endpointId, String endpointName) {
        if (!isModuleDestroyed && managersInitialized) {
            reconnectionManager.scheduleReconnect(endpointId, endpointName);
        }
    }

    private void attemptReconnection(String endpointId) {
        if (isModuleDestroyed) return;
        // FIX #1: Use endpointNameCache — survives disconnection
        String endpointName = endpointNameCache.getOrDefault(endpointId, endpointId);
        requestConnectionInternal(endpointId, endpointName);
    }

    private void handleHeartbeatTimeout(String endpointId) {
        if (!isModuleDestroyed && connectionsClient != null) {
            try {
                connectionsClient.disconnectFromEndpoint(endpointId);
            } catch (Exception e) {
                Log.e(TAG, "❌ Disconnect on heartbeat timeout error: " + e.getMessage());
            }
        }
    }

    private void disconnectFromEndpoint(String endpointId) {
        if (isModuleDestroyed) return;
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
            Log.e(TAG, "❌ disconnectFromEndpoint error: " + e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  PAYLOAD CALLBACK
    // ─────────────────────────────────────────────────────────────────────────
    private final PayloadCallback payloadCallback = new PayloadCallback() {

        @Override
        public void onPayloadReceived(@NonNull String endpointId, @NonNull Payload payload) {
            if (isModuleDestroyed) return;

            if (payload.getType() == Payload.Type.BYTES && payload.asBytes() != null) {
                byte[] data = payload.asBytes();

                // Heartbeat byte
                if (data.length == 0 || (data.length == 1 && data[0] == 0x00)) {
                    heartbeatManager.recordHeartbeatReceived(endpointId);
                    Log.d(TAG, "💓 Heartbeat from: " + endpointNameCache.getOrDefault(endpointId, endpointId));
                } else {
                    String json = new String(data, StandardCharsets.UTF_8);
                    Log.d(TAG, "📨 Payload from: " + endpointNameCache.getOrDefault(endpointId, endpointId));
                    emitPayload(endpointId, json);
                }
            }
        }

        @Override
        public void onPayloadTransferUpdate(@NonNull String endpointId,
                                            @NonNull PayloadTransferUpdate update) {
            // No-op for small byte payloads
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    //  EMIT TO JS
    // ─────────────────────────────────────────────────────────────────────────
    private void emitConnected(String endpointId, String deviceName) {
        WritableMap m = Arguments.createMap();
        m.putString("endpointId", endpointId);
        m.putString("deviceName", deviceName);
        emit(EVENT_CONNECTED, m);
    }

    private void emitDisconnected(String endpointId, String deviceName) {
        WritableMap m = Arguments.createMap();
        m.putString("endpointId", endpointId);
        m.putString("deviceName", deviceName);
        emit(EVENT_DISCONNECTED, m);
    }

    private void emitPayload(String endpointId, String json) {
        WritableMap m = Arguments.createMap();
        m.putString("endpointId", endpointId);
        m.putString("payload", json);
        emit(EVENT_PAYLOAD, m);
    }

    private void emitReconnecting(String endpointId, int attempt) {
        WritableMap m = Arguments.createMap();
        m.putString("endpointId", endpointId);
        m.putInt("attempt", attempt);
        emit(EVENT_RECONNECT, m);
    }

    private void emitPermissionError(String missing) {
        WritableMap m = Arguments.createMap();
        m.putString("missing", missing);
        emit(EVENT_PERMISSION, m);
    }

    private void emitStatus(String status) {
        WritableMap m = Arguments.createMap();
        m.putString("status", status);
        emit(EVENT_STATUS, m);
    }

    private void emitDebug(String message) {
        WritableMap m = Arguments.createMap();
        m.putString("message", message);
        emit(EVENT_DEBUG, m);
    }

    private void emit(String event, WritableMap data) {
        if (isModuleDestroyed) return;
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(event, data);
        } catch (Exception e) {
            Log.e(TAG, "❌ Failed to emit " + event + ": " + e.getMessage());
        }
    }

    // Required for RN 0.65+ event system
    @ReactMethod public void addListener(String eventName) {}
    @ReactMethod public void removeListeners(Integer count) {}

    // ─────────────────────────────────────────────────────────────────────────
    //  LIFECYCLE
    // ─────────────────────────────────────────────────────────────────────────
    @Override
    public void invalidate() {
        super.invalidate();
        Log.d(TAG, "🔴 Module invalidate called");
        isModuleDestroyed = true;
        try { stop(null); } catch (Exception e) { Log.e(TAG, "❌ Error during invalidate: " + e.getMessage()); }
        Log.d(TAG, "✅ Module destroyed");
    }
}