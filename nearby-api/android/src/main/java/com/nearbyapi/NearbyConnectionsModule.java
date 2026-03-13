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

    private static final String TAG = "NearbyConnections";

    private static final String SERVICE_ID = "com.pragadeesh.ticketscanner";

    private static final Strategy STRATEGY = Strategy.P2P_CLUSTER;

    private final ReactApplicationContext reactContext;
    private ConnectionsClient connectionsClient;
    private String localDeviceName;
    private volatile boolean isModuleDestroyed = false;
    private volatile boolean isStopping = false;

    private final Map<String, String> connectedEndpoints  = new ConcurrentHashMap<>();

    private final Set<String> exhaustedEndpoints = ConcurrentHashMap.newKeySet();

    private final Map<String, String> endpointNameCache = new ConcurrentHashMap<>();

    private final Map<String, String> pendingConnectionNames = new ConcurrentHashMap<>();

    private final Set<String> connectingEndpoints = ConcurrentHashMap.newKeySet();

    private final Map<String, Integer> payloadFailCounts = new ConcurrentHashMap<>();

    private final Map<Long, Long> seenPayloadIds = new ConcurrentHashMap<>(); 
    private static final long PAYLOAD_DEDUP_TTL_MS = 5_000; 
    private static final int PAYLOAD_FAIL_THRESHOLD = 3;

    private PermissionsManager       permissionsManager;
    private ConnectionTimeoutManager timeoutManager;
    private ReconnectionManager      reconnectionManager;
    private HeartbeatManager         heartbeatManager;
    private volatile boolean         managersInitialized = false;

    private static final String EVENT_CONNECTED      = "NearbyConnected";
    private static final String EVENT_DISCONNECTED   = "NearbyDisconnected";
    private static final String EVENT_PAYLOAD        = "NearbyPayloadReceived";
    private static final String EVENT_STATUS         = "NearbyStatusChanged";
    private static final String EVENT_RECONNECT      = "NearbyReconnecting";
    private static final String EVENT_PERMISSION     = "NearbyPermissionError";
    private static final String EVENT_DEBUG          = "NearbyDebug";
    private static final String EVENT_DEVICE_FOUND   = "NearbyDeviceFound";
    private static final String EVENT_PAYLOAD_FAILED = "NearbyPayloadFailed";

    public NearbyConnectionsModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        Log.d(TAG, "Module instantiated");
    }

    @NonNull
    @Override
    public String getName() {
        return "NearbyModule";
    }

    private synchronized void ensureManagersInitialized() {
        if (managersInitialized || isModuleDestroyed) return;
        Log.d(TAG, "Initializing managers...");

        permissionsManager = new PermissionsManager();
        timeoutManager     = new ConnectionTimeoutManager();

        heartbeatManager = new HeartbeatManager(
            reactContext,
            connectedEndpoints,
            endpointId -> {
                if (!isModuleDestroyed) {
                    Log.w(TAG, "Heartbeat timeout: " + endpointId);
                    handleHeartbeatTimeout(endpointId);
                }
            }
        );

        reconnectionManager = new ReconnectionManager(
            reactContext,
            new ReconnectionManager.ReconnectionListener() {
                @Override
                public void onReconnectScheduled(String endpointId, int attempt) {
                    if (!isModuleDestroyed) {
                        String name = endpointNameCache.getOrDefault(endpointId, endpointId);
                        emitReconnecting(name, attempt);
                    }
                }

                @Override
                public void onReconnectAttempt(String endpointId, int attempt) {
                    if (!isModuleDestroyed) attemptReconnection(endpointId);
                }

                @Override
                public void onReconnectFailed(String endpointId) {
                    if (!isModuleDestroyed) {
                        String name = endpointNameCache.getOrDefault(endpointId, endpointId);
                        Log.w(TAG, "Reconnect exhausted for: " + name
                            + " -- restarting both directions");
                        exhaustedEndpoints.add(endpointId);
                        emitStatus("reconnect_failed_" + name);
                        startAdvertisingInternal(localDeviceName);
                        startDiscoveryInternal();
                    }
                }
            }
        );

        managersInitialized = true;
        Log.d(TAG, "All managers initialized");
    }

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
            Log.d(TAG, "Requesting permissions: " + missing);
            getCurrentActivity().requestPermissions(missing.toArray(new String[0]), 1234);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("PERMISSION_REQUEST_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void start(String deviceName, Promise promise) {
        try {
            Log.d(TAG, "Nearby init as: " + deviceName);
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
                Log.w(TAG, "Module already destroyed");
                if (promise != null) promise.resolve(true);
                return;
            }

            Log.d(TAG, "Stopping Nearby service...");
            isStopping = true;

            ConnectionsClient clientToStop = connectionsClient;
            connectionsClient = null;

            if (clientToStop != null) {
                try { clientToStop.stopAdvertising(); }
                catch (Exception e) { Log.w(TAG, "stopAdvertising: " + e.getMessage()); }

                try { clientToStop.stopDiscovery(); }
                catch (Exception e) { Log.w(TAG, "stopDiscovery: " + e.getMessage()); }
                try { clientToStop.stopAllEndpoints(); }
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
            payloadFailCounts.clear();
            exhaustedEndpoints.clear();

            isStopping = false;
            emitStatus("stopped");
            if (promise != null) promise.resolve(true);
            Log.d(TAG, "Nearby service stopped");
        } catch (Exception e) {
            isStopping = false;
            Log.e(TAG, "stop error: " + e.getMessage(), e);
            if (promise != null) promise.reject("STOP_ERROR", e.getMessage());
        }
    }
    private void startAdvertisingInternal(String deviceName) {
        if (connectionsClient == null || isModuleDestroyed || isStopping) return;

        AdvertisingOptions options = new AdvertisingOptions.Builder()
                .setStrategy(STRATEGY)
                .build();
        connectionsClient.startAdvertising(
                deviceName, SERVICE_ID, connectionLifecycleCallback, options
        ).addOnSuccessListener(unused -> {
            if (!isModuleDestroyed) {
                Log.d(TAG, "Advertising started as: " + deviceName);
                emitDebug("Advertising started as: " + deviceName);
            }
        }).addOnFailureListener(e -> {
            if (isModuleDestroyed) return;

            if (e instanceof com.google.android.gms.common.api.ApiException) {
                int code = ((com.google.android.gms.common.api.ApiException) e).getStatusCode();
                if (code == ConnectionsStatusCodes.STATUS_ALREADY_ADVERTISING) {
                    Log.d(TAG, "Already advertising");
                    return;
                }
            }

            Log.e(TAG, "Advertising failed: " + e.getMessage() + " — retrying in 2s");
            emitDebug("Advertising failed: " + e.getMessage());
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                if (!isModuleDestroyed) startAdvertisingInternal(deviceName);
            }, 2000);
        });
    }

    private void startDiscoveryInternal() {
        if (connectionsClient == null || isModuleDestroyed || isStopping) return;

        DiscoveryOptions options = new DiscoveryOptions.Builder()
                .setStrategy(STRATEGY)
                .build();
        connectionsClient.startDiscovery(
                SERVICE_ID, endpointDiscoveryCallback, options
        ).addOnSuccessListener(unused -> {
            if (!isModuleDestroyed) {
                Log.d(TAG, "Discovery started");
                emitDebug("Discovery started. Scanning for nearby devices...");
            }
        }).addOnFailureListener(e -> {
            if (isModuleDestroyed) return;

            if (e instanceof com.google.android.gms.common.api.ApiException) {
                int code = ((com.google.android.gms.common.api.ApiException) e).getStatusCode();
                if (code == ConnectionsStatusCodes.STATUS_ALREADY_DISCOVERING) {
                    Log.d(TAG, "Already discovering");
                    return;
                }
            }

            Log.e(TAG, "Discovery failed: " + e.getMessage() + " — retrying in 2s");
            emitDebug("Discovery failed: " + e.getMessage());
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                if (!isModuleDestroyed) startDiscoveryInternal();
            }, 2000);
        });
    }
    private final ConnectionLifecycleCallback connectionLifecycleCallback =
            new ConnectionLifecycleCallback() {

        @Override
        public void onConnectionInitiated(@NonNull String endpointId,
                                          @NonNull ConnectionInfo connectionInfo) {
            if (isModuleDestroyed) return;

            String remoteName = connectionInfo.getEndpointName();
            Log.d(TAG, "Connection initiated: " + endpointId + " (" + remoteName + ")");
            pendingConnectionNames.put(endpointId, remoteName);
            endpointNameCache.put(endpointId, remoteName);
            try {
                connectionsClient.acceptConnection(endpointId, payloadCallback);
            } catch (Exception e) {
                Log.e(TAG, "acceptConnection error: " + e.getMessage());
                timeoutManager.cancelTimeout(endpointId);
                pendingConnectionNames.remove(endpointId);
            }
        }

        @Override
        public void onConnectionResult(@NonNull String endpointId,
                                       @NonNull ConnectionResolution result) {
            if (isModuleDestroyed) return;

            connectingEndpoints.remove(endpointId);
            timeoutManager.cancelTimeout(endpointId);

            String deviceName = pendingConnectionNames.remove(endpointId);
            if (deviceName == null) {
                deviceName = endpointNameCache.getOrDefault(endpointId, endpointId);
            }

            int statusCode = result.getStatus().getStatusCode();

            if (statusCode == ConnectionsStatusCodes.STATUS_OK) {
                connectedEndpoints.put(endpointId, deviceName);
                heartbeatManager.startHeartbeatForEndpoint(endpointId);
                reconnectionManager.clearAttempts(endpointId);
                reconnectionManager.clearAttemptsByName(deviceName);
                exhaustedEndpoints.remove(endpointId);
                payloadFailCounts.put(endpointId, 0);

                Log.d(TAG, "Connected: " + deviceName + " (" + connectedEndpoints.size() + " total)");
                emitDebug("Connected to: " + deviceName);
                emitConnected(endpointId, deviceName);

            } else if (statusCode == ConnectionsStatusCodes.STATUS_CONNECTION_REJECTED) {
                Log.w(TAG, "Connection rejected by: " + deviceName);
                emitDebug("Connection rejected: " + deviceName);
                reconnectionManager.clearAttempts(endpointId);
                startDiscoveryInternal();
                startAdvertisingInternal(localDeviceName);

            } else if (statusCode == 8013) {
                Log.w(TAG, "STATUS_ENDPOINT_UNKNOWN for " + deviceName + " — restarting discovery");
                reconnectionManager.clearAttempts(endpointId);
                startDiscoveryInternal();
                startAdvertisingInternal(localDeviceName);

            } else if (statusCode == ConnectionsStatusCodes.STATUS_ERROR) {
                Log.w(TAG, "STATUS_ERROR connecting to " + deviceName + " — scheduling reconnect");
                scheduleReconnection(endpointId, deviceName);

            } else {
                Log.w(TAG, "Unknown connection failure code " + statusCode + " for " + deviceName);
                scheduleReconnection(endpointId, deviceName);
            }
        }

        @Override
        public void onDisconnected(@NonNull String endpointId) {
            if (isModuleDestroyed) return;

            String deviceName = connectedEndpoints.remove(endpointId);
            if (deviceName == null) deviceName = endpointNameCache.getOrDefault(endpointId, endpointId);

            Log.d(TAG, "Disconnected: " + deviceName + (isStopping ? " [during stop — skipping emit+reconnect]" : ""));
            heartbeatManager.stopHeartbeatForEndpoint(endpointId);
            timeoutManager.cancelTimeout(endpointId);
            connectingEndpoints.remove(endpointId);
            payloadFailCounts.remove(endpointId);
            if (isStopping) return;

            emitDisconnected(endpointId, deviceName);
            scheduleReconnection(endpointId, deviceName);
        }
    };
    private final EndpointDiscoveryCallback endpointDiscoveryCallback =
            new EndpointDiscoveryCallback() {

        @Override
        public void onEndpointFound(@NonNull String endpointId,
                                    @NonNull DiscoveredEndpointInfo info) {
            if (isModuleDestroyed) return;

            String remoteName = info.getEndpointName();
            if (localDeviceName != null && localDeviceName.equals(remoteName)) {
                Log.d(TAG, "[Self-Filter] Ignoring self: " + remoteName);
                return;
            }

            endpointNameCache.put(endpointId, remoteName);

            Log.d(TAG, "Endpoint found: " + remoteName + " (" + endpointId + ")");
            emitDebug("Found device: " + remoteName);

            WritableMap found = Arguments.createMap();
            found.putString("endpointId", endpointId);
            found.putString("deviceName", remoteName);
            emit(EVENT_DEVICE_FOUND, found);
            if (connectedEndpoints.containsKey(endpointId)) {
                Log.d(TAG, "Already connected to " + remoteName + " — skipping");
                return;
            }
            if (connectingEndpoints.contains(endpointId)) {
                Log.w(TAG, "Already connecting to: " + remoteName + " (" + endpointId + ")");
                return;
            }
            for (String cId : connectingEndpoints) {
                String cName = endpointNameCache.getOrDefault(cId, "");
                if (cName.equals(remoteName)) {
                    Log.w(TAG, "Already connecting to " + remoteName + " via " + cId + " — skipping duplicate");
                    return;
                }
            }
            if (managersInitialized) {
                reconnectionManager.clearAttempts(endpointId);
                exhaustedEndpoints.remove(endpointId);
            }
            Log.d(TAG, "Initiating connection to: " + remoteName + " (" + endpointId + ")");
            connectingEndpoints.add(endpointId);
            requestConnectionInternal(endpointId, remoteName);
        }

        @Override
        public void onEndpointLost(@NonNull String endpointId) {
            if (isModuleDestroyed) return;
            String name = endpointNameCache.getOrDefault(endpointId, endpointId);
            Log.d(TAG, "Endpoint lost: " + name + " — waiting for rediscovery");
            connectingEndpoints.remove(endpointId);
        }
    };
    @ReactMethod
    public void requestConnection(String endpointId, String endpointName, Promise promise) {
        if (isModuleDestroyed || connectionsClient == null) {
            if (promise != null) promise.resolve(false);
            return;
        }
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
                    Log.d(TAG, "Connection request sent to: " + endpointName);
                    timeoutManager.startConnectionTimeout(endpointId, () -> {
                        if (!isModuleDestroyed) {
                            Log.w(TAG, "Connection timeout: " + endpointId);
                            connectingEndpoints.remove(endpointId);
                            scheduleReconnection(endpointId, endpointName);
                        }
                    });
                })
                .addOnFailureListener(e -> {
                    if (isModuleDestroyed) return;

                    int code = -1;
                    if (e instanceof com.google.android.gms.common.api.ApiException) {
                        code = ((com.google.android.gms.common.api.ApiException) e).getStatusCode();
                    }

                    if (code == ConnectionsStatusCodes.STATUS_ALREADY_CONNECTED_TO_ENDPOINT) {
                        Log.d(TAG, "STATUS_ALREADY_CONNECTED to " + endpointName + " — purging stale state");
                        connectionsClient.disconnectFromEndpoint(endpointId);
                        connectedEndpoints.remove(endpointId);
                        connectingEndpoints.remove(endpointId);
                        return;
                    }

                    if (code == ConnectionsStatusCodes.STATUS_ALREADY_ADVERTISING
                            || code == ConnectionsStatusCodes.STATUS_ALREADY_DISCOVERING) {
                        Log.d(TAG, "Non-fatal status " + code + " from requestConnection — ignoring");
                        connectingEndpoints.remove(endpointId);
                        return;
                    }

                    connectingEndpoints.remove(endpointId);
                    Log.w(TAG, "requestConnection failed for " + endpointName + " (code " + code + ")");

                    if (code == 8013) {
                        Log.w(TAG, "STATUS_ENDPOINT_UNKNOWN — clearing and restarting discovery");
                        reconnectionManager.clearAttempts(endpointId);
                        startDiscoveryInternal();
                        startAdvertisingInternal(localDeviceName);
                    } else {
                        scheduleReconnection(endpointId, endpointName);
                    }
                });
        } catch (Exception e) {
            Log.e(TAG, "requestConnectionInternal exception: " + e.getMessage(), e);
            connectingEndpoints.remove(endpointId);
            scheduleReconnection(endpointId, endpointName);
        }
    }
    @ReactMethod
    public void broadcastPayload(String jsonPayload, Promise promise) {
        if (isModuleDestroyed) {
            promise.reject("MODULE_DESTROYED", "Module has been destroyed");
            return;
        }
        if (connectionsClient == null || connectedEndpoints.isEmpty()) {
            Log.w(TAG, "No connected devices to broadcast to");
            promise.resolve(false);
            return;
        }

        try {
            byte[] bytes = jsonPayload.getBytes(StandardCharsets.UTF_8);
            if (bytes.length > ConnectionsClient.MAX_BYTES_DATA_SIZE) {
                Log.e(TAG, "Payload too large: " + bytes.length
                    + " bytes (max " + ConnectionsClient.MAX_BYTES_DATA_SIZE + ")");
                promise.reject("PAYLOAD_TOO_LARGE",
                    "Payload " + bytes.length + " bytes exceeds 32KB BYTES limit. Use FILE payload for large data.");
                return;
            }

            Log.d(TAG, "Broadcasting to " + connectedEndpoints.size() + " device(s), "
                + bytes.length + " bytes");

            int successCount = 0;
            int failCount    = 0;

            for (Map.Entry<String, String> entry : connectedEndpoints.entrySet()) {
                try {
                    Payload freshPayload = Payload.fromBytes(bytes);
                    connectionsClient.sendPayload(entry.getKey(), freshPayload);
                    Log.d(TAG, "  Sent to: " + entry.getValue());
                    successCount++;
                } catch (Exception e) {
                    Log.w(TAG, "  Failed to send to: " + entry.getValue() + " — " + e.getMessage());
                    failCount++;
                }
            }

            Log.d(TAG, "Broadcast done: " + successCount + " sent, " + failCount + " failed");
            if (successCount > 0 && managersInitialized) {
                for (String endpointId : connectedEndpoints.keySet()) {
                    heartbeatManager.schedulePostBurstProbe(endpointId);
                }
            }
            promise.resolve(successCount > 0);
        } catch (Exception e) {
            Log.e(TAG, "Broadcast error: " + e.getMessage(), e);
            promise.reject("BROADCAST_ERROR", e.getMessage());
        }
    }
    @ReactMethod
    public void sendToEndpoint(String endpointId, String jsonPayload, Promise promise) {
        if (isModuleDestroyed || connectionsClient == null) {
            promise.resolve(false);
            return;
        }
        if (!connectedEndpoints.containsKey(endpointId)) {
            Log.w(TAG, "sendToEndpoint: " + endpointId + " not in connectedEndpoints");
            promise.resolve(false);
            return;
        }
        try {
            byte[] bytes = jsonPayload.getBytes(StandardCharsets.UTF_8);
            if (bytes.length > ConnectionsClient.MAX_BYTES_DATA_SIZE) {
                promise.reject("PAYLOAD_TOO_LARGE", "Payload exceeds 32KB BYTES limit");
                return;
            }
            Payload payload = Payload.fromBytes(bytes);
            connectionsClient.sendPayload(endpointId, payload);
            Log.d(TAG, "Sent to " + endpointNameCache.getOrDefault(endpointId, endpointId)
                + " (" + bytes.length + " bytes)");
            promise.resolve(true);
        } catch (Exception e) {
            Log.e(TAG, "sendToEndpoint error: " + e.getMessage());
            promise.resolve(false);
        }
    }
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
            d.putInt("android_api",        android.os.Build.VERSION.SDK_INT);
            d.putString("local_name",      localDeviceName != null ? localDeviceName : "");
            d.putInt("connected_devices",  connectedEndpoints.size());
            d.putInt("connecting_devices", connectingEndpoints.size());
            d.putInt("exhausted_ids",      exhaustedEndpoints.size());
            d.putInt("cached_names",       endpointNameCache.size());
            d.putString("service_id",      SERVICE_ID);
            d.putString("strategy",        STRATEGY.toString());
            d.putString("permissions",     permissionsManager.getPermissionsSummary(reactContext));
            d.putBoolean("all_perms_ok",   permissionsManager.hasAllNearbyPermissions(reactContext));
            Log.d(TAG, "Diagnostics: " + d.toString());
            promise.resolve(d);
        } catch (Exception e) {
            promise.reject("DIAGNOSTIC_ERROR", e.getMessage());
        }
    }
    private final PayloadCallback payloadCallback = new PayloadCallback() {

        @Override
        public void onPayloadReceived(@NonNull String endpointId, @NonNull Payload payload) {
            if (isModuleDestroyed) return;

            if (payload.getType() != Payload.Type.BYTES) return;
            byte[] data = payload.asBytes();
            if (data == null) return;

            if (data.length == 0 || (data.length == 1 && data[0] == 0x00)) {
                heartbeatManager.recordHeartbeatReceived(endpointId);
                Log.d(TAG, "Heartbeat from: " + endpointNameCache.getOrDefault(endpointId, endpointId));
                return;
            }

            long payloadId = payload.getId();
            long nowMs     = System.currentTimeMillis();
            seenPayloadIds.entrySet().removeIf(e -> nowMs - e.getValue() > PAYLOAD_DEDUP_TTL_MS);

            if (seenPayloadIds.containsKey(payloadId)) {
                Log.w(TAG, "Duplicate payloadId " + payloadId + " — dropped");
                return;
            }
            seenPayloadIds.put(payloadId, nowMs);

            String json = new String(data, StandardCharsets.UTF_8);
            Log.d(TAG, "Payload received from: " + endpointNameCache.getOrDefault(endpointId, endpointId)
                + " (" + data.length + " bytes)");
            emitPayload(endpointId, json);
        }

        @Override
        public void onPayloadTransferUpdate(@NonNull String endpointId,
                                            @NonNull PayloadTransferUpdate update) {
            if (isModuleDestroyed) return;

            int status = update.getStatus();

            if (status == PayloadTransferUpdate.Status.SUCCESS) {
                payloadFailCounts.put(endpointId, 0);
                Log.d(TAG, "PayloadTransferUpdate SUCCESS — endpoint: "
                    + endpointNameCache.getOrDefault(endpointId, endpointId));

            } else if (status == PayloadTransferUpdate.Status.FAILURE) {
                String deviceName = endpointNameCache.getOrDefault(endpointId, endpointId);

                int failures = payloadFailCounts.getOrDefault(endpointId, 0) + 1;
                payloadFailCounts.put(endpointId, failures);

                Log.w(TAG, "PayloadTransferUpdate FAILURE #" + failures
                    + " — endpoint: " + deviceName
                    + " (threshold: " + PAYLOAD_FAIL_THRESHOLD + ")");

                if (failures >= PAYLOAD_FAIL_THRESHOLD) {
                    payloadFailCounts.put(endpointId, 0);

                    Log.e(TAG, "🔴 PAYLOAD_FAIL_THRESHOLD reached for " + deviceName
                        + " — emitting NearbyPayloadFailed to JS");
                    emitPayloadFailed(endpointId, deviceName, failures);
                }
            }
        }
    };
    private void scheduleReconnection(String endpointId, String endpointName) {
        if (isModuleDestroyed || isStopping || !managersInitialized) return;
        if (exhaustedEndpoints.contains(endpointId)) {
            Log.d(TAG, "Skipping reconnect for exhausted endpointId: " + endpointName);
            return;
        }
        reconnectionManager.scheduleReconnect(endpointId, endpointName);
    }

    private void attemptReconnection(String endpointId) {
        if (isModuleDestroyed) return;
        String endpointName = endpointNameCache.getOrDefault(endpointId, endpointId);
        requestConnectionInternal(endpointId, endpointName);
    }

    private void handleHeartbeatTimeout(String endpointId) {
        if (isModuleDestroyed) return;
        String deviceName = connectedEndpoints.getOrDefault(
            endpointId, endpointNameCache.getOrDefault(endpointId, endpointId));

        Log.w(TAG, "Ghost connection via heartbeat timeout: " + deviceName + " (" + endpointId + ")");

        connectedEndpoints.remove(endpointId);
        connectingEndpoints.remove(endpointId);
        heartbeatManager.stopHeartbeatForEndpoint(endpointId);
        timeoutManager.cancelTimeout(endpointId);
        payloadFailCounts.remove(endpointId);

        emitDisconnected(endpointId, deviceName);

        if (connectionsClient != null) {
            try { connectionsClient.disconnectFromEndpoint(endpointId); }
            catch (Exception e) { Log.w(TAG, "Disconnect on HB timeout: " + e.getMessage()); }
        }

        startAdvertisingInternal(localDeviceName);
        startDiscoveryInternal();
        scheduleReconnection(endpointId, deviceName);
    }

    private void disconnectFromEndpoint(String endpointId) {
        if (isModuleDestroyed) return;
        try {
            if (managersInitialized) {
                heartbeatManager.stopHeartbeatForEndpoint(endpointId);
                timeoutManager.cancelTimeout(endpointId);
                reconnectionManager.clearAttempts(endpointId);
            }
            payloadFailCounts.remove(endpointId);
            if (connectionsClient != null) {
                connectionsClient.disconnectFromEndpoint(endpointId);
            }
        } catch (Exception e) {
            Log.e(TAG, "disconnectFromEndpoint error: " + e.getMessage());
        }
    }

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

    private void emitPayloadFailed(String endpointId, String deviceName, int failCount) {
        WritableMap m = Arguments.createMap();
        m.putString("endpointId", endpointId);
        m.putString("deviceName", deviceName);
        m.putInt("failCount", failCount);
        emit(EVENT_PAYLOAD_FAILED, m);
        Log.w(TAG, "NearbyPayloadFailed emitted for: " + deviceName
            + " (failCount=" + failCount + ")");
    }

    private void emit(String event, WritableMap data) {
        if (isModuleDestroyed) return;
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(event, data);
        } catch (Exception e) {
            Log.e(TAG, "Failed to emit " + event + ": " + e.getMessage());
        }
    }
    @ReactMethod public void addListener(String eventName) {}
    @ReactMethod public void removeListeners(Integer count) {}

    @Override
    public void invalidate() {
        super.invalidate();
        Log.d(TAG, "Module invalidate called");
        isModuleDestroyed = true;
        try { stop(null); } catch (Exception e) { Log.e(TAG, "Error during invalidate: " + e.getMessage()); }
        Log.d(TAG, "Module destroyed");
    }
}