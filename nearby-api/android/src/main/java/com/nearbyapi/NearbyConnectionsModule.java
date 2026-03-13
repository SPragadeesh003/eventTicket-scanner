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

/**
 * NearbyConnectionsModule — React Native native module for Google Nearby Connections.
 *
 * API alignment checklist (verified against official docs, March 2026):
 *  [x] Nearby.getConnectionsClient(context) — correct entry point (not deprecated Connections class)
 *  [x] Strategy.P2P_CLUSTER — correct for multi-gate many-to-many mesh
 *  [x] SERVICE_ID = app package name (recommended by docs)
 *  [x] startAdvertising(localName, SERVICE_ID, connectionLifecycleCallback, options)
 *  [x] startDiscovery(SERVICE_ID, endpointDiscoveryCallback, options)
 *  [x] requestConnection(localName, endpointId, connectionLifecycleCallback) — discoverer-side
 *  [x] acceptConnection(endpointId, payloadCallback) — both sides accept in onConnectionInitiated
 *  [x] Payload.fromBytes() — fresh instance per sendPayload() call (Nearby tracks by payload ID)
 *  [x] ConnectionsClient.MAX_BYTES_DATA_SIZE — 32KB guard on all sendPayload calls
 *  [x] sendPayload(endpointId, payload) — single-target AND broadcast variants
 *  [x] stopAllEndpoints() — used instead of per-endpoint disconnectFromEndpoint on shutdown
 *  [x] onPayloadTransferUpdate — BYTES failure detection: 3 consecutive failures → NearbyPayloadFailed
 *  [x] STATUS_OK / STATUS_CONNECTION_REJECTED / STATUS_ERROR — all handled distinctly
 *  [x] STATUS_ENDPOINT_UNKNOWN (8013) — stale endpointId: clear + restart, not retry
 *  [x] STATUS_ALREADY_ADVERTISING / STATUS_ALREADY_DISCOVERING — non-fatal, not an error
 *  [x] STATUS_ALREADY_CONNECTED_TO_ENDPOINT — clean up stale local state only
 *  [x] PermissionsManager — API-level-gated checks matching official permission matrix
 *  [x] addListener / removeListeners stubs — required for RN 0.65+ NativeEventEmitter
 *  [x] sendToEndpoint() — targeted send for CATCHUP (avoids re-ACKs from synced peers)
 *  [x] getDiagnostics() — includes permission summary from PermissionsManager
 *  [x] onEndpointLost() — does NOT schedule reconnection (endpoint truly gone from radio range)
 *  [x] Heartbeat byte = 0x00 — distinguished from real payloads, not emitted to JS
 *  [x] stopDiscovery() note: after calling it, can still requestConnection to already-found peers
 */
public class NearbyConnectionsModule extends ReactContextBaseJavaModule {

    private static final String TAG = "NearbyConnections";

    // serviceId MUST be unique to your app. Official best practice: use package name.
    private static final String SERVICE_ID = "com.pragadeesh.ticketscanner";

    // P2P_CLUSTER: many-to-many mesh, all devices can advertise AND discover simultaneously.
    // Bandwidth is lower than STAR/P2P_POINT_TO_POINT but topology is fully flexible.
    // Correct strategy for a multi-gate ticket scanner where any gate can talk to any other.
    private static final Strategy STRATEGY = Strategy.P2P_CLUSTER;

    private final ReactApplicationContext reactContext;
    private ConnectionsClient connectionsClient;
    private String localDeviceName;
    private volatile boolean isModuleDestroyed = false;

    // ── Active connection tracking ────────────────────────────────────────────
    // endpointId → deviceName (only fully CONNECTED entries, not pending)
    private final Map<String, String> connectedEndpoints  = new ConcurrentHashMap<>();

    // Tracks endpointIds whose retry budget is exhausted — prevents late-firing
    // onDisconnected from restarting the retry loop on a dead endpointId.
    private final Set<String> exhaustedEndpoints = ConcurrentHashMap.newKeySet();

    // Persistent name cache: endpointId → deviceName, survives disconnection.
    // Required because connectedEndpoints.remove() is called on disconnect,
    // but we still need the name for reconnection logs and retry scheduling.
    private final Map<String, String> endpointNameCache = new ConcurrentHashMap<>();

    // Name resolved in onConnectionInitiated (before onConnectionResult arrives).
    // Prevents null deviceName in onConnectionResult when cache lookup fails.
    private final Map<String, String> pendingConnectionNames = new ConcurrentHashMap<>();

    // Thread-safe set of endpointIds for which requestConnection is in-flight.
    // Guards against double-discovery and double-connection races.
    private final Set<String> connectingEndpoints = ConcurrentHashMap.newKeySet();

    // ── Payload failure tracking ──────────────────────────────────────────────
    //
    // onPayloadTransferUpdate fires for every BYTES send attempt with a
    // PayloadTransferUpdate.Status: SUCCESS or FAILURE.
    //
    // sendPayload() is fire-and-forget — it only queues the payload.
    // Ghost SUCCESS happens when sendPayload() is accepted into the queue
    // but the transport layer silently drops it. The real outcome appears
    // here in onPayloadTransferUpdate.
    //
    // Strategy: track consecutive FAILURE callbacks per endpoint.
    // After PAYLOAD_FAIL_THRESHOLD consecutive failures on one endpoint,
    // emit NearbyPayloadFailed to JS — this is a faster signal (~200-600ms)
    // than waiting for ACK timeouts (~20s) to detect a stale channel.
    //
    // Reset to 0 on any SUCCESS (single good send = channel still alive).
    // Removed entirely on disconnect / stop.
    private final Map<String, Integer> payloadFailCounts = new ConcurrentHashMap<>();

    // Payload dedup: Nearby sometimes calls onPayloadReceived multiple times
    // for the same payloadId. Cache recent IDs and drop duplicates in Java
    // before they ever reach the JS bridge.
    private final Map<Long, Long> seenPayloadIds = new ConcurrentHashMap<>(); // payloadId → receivedAtMs
    private static final long PAYLOAD_DEDUP_TTL_MS = 5_000; // 5s window
    private static final int PAYLOAD_FAIL_THRESHOLD = 3;

    // ── Reliability managers ──────────────────────────────────────────────────
    private PermissionsManager       permissionsManager;
    private ConnectionTimeoutManager timeoutManager;
    private ReconnectionManager      reconnectionManager;
    private HeartbeatManager         heartbeatManager;
    private volatile boolean         managersInitialized = false;

    // ── JS event names ────────────────────────────────────────────────────────
    private static final String EVENT_CONNECTED      = "NearbyConnected";
    private static final String EVENT_DISCONNECTED   = "NearbyDisconnected";
    private static final String EVENT_PAYLOAD        = "NearbyPayloadReceived";
    private static final String EVENT_STATUS         = "NearbyStatusChanged";
    private static final String EVENT_RECONNECT      = "NearbyReconnecting";
    private static final String EVENT_PERMISSION     = "NearbyPermissionError";
    private static final String EVENT_DEBUG          = "NearbyDebug";
    private static final String EVENT_DEVICE_FOUND   = "NearbyDeviceFound";
    // Emitted when PAYLOAD_FAIL_THRESHOLD consecutive send failures are detected
    // on one endpoint. JS (NearbyConnectionServices) listens for this and
    // calls forceReconnect() immediately — bypassing the full ACK timeout cycle.
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

    // ─────────────────────────────────────────────────────────────────────────
    //  MANAGER INITIALIZATION
    // ─────────────────────────────────────────────────────────────────────────
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
                        // Restart BOTH advertising AND discovery.
                        // Note (docs): stopDiscovery() does not disconnect already-found peers;
                        // restarting it here resets scan state so peer can be rediscovered
                        // with a fresh endpointId.
                        startAdvertisingInternal(localDeviceName);
                        startDiscoveryInternal();
                    }
                }
            }
        );

        managersInitialized = true;
        Log.d(TAG, "All managers initialized");
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  PERMISSIONS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Returns a JS array of permission strings that are applicable to this device's
     * API level but not yet granted. Empty array = all good.
     */
    @ReactMethod
    public void checkPermissions(Promise promise) {
        ensureManagersInitialized();
        List<String> missing = permissionsManager.getMissingPermissions(reactContext);
        com.facebook.react.bridge.WritableArray arr = Arguments.createArray();
        for (String p : missing) arr.pushString(p);
        promise.resolve(arr);
    }

    /**
     * Triggers Android runtime permission request for all missing Nearby permissions.
     * Only requests permissions valid for the current API level (no BLUETOOTH_SCAN
     * request on API 30, no BLUETOOTH request on API 31, etc.).
     */
    @ReactMethod
    public void requestPermissions(Promise promise) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                // Pre-M: all permissions are install-time, nothing to request at runtime
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

    // ─────────────────────────────────────────────────────────────────────────
    //  START / STOP
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Initializes the ConnectionsClient and starts the heartbeat scheduler.
     * Must be called before startAdvertising() or startDiscovery().
     *
     * Uses Nearby.getConnectionsClient(context) — the current entry point.
     * The older com.google.android.gms.nearby.connection.Connections class is deprecated.
     */
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

            // Nearby.getConnectionsClient() is the correct modern entry point.
            // Returns a singleton-like client; safe to call multiple times.
            connectionsClient = Nearby.getConnectionsClient(reactContext);
            heartbeatManager.startHeartbeat();
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("START_ERROR", e.getMessage());
        }
    }

    /**
     * Starts BLE advertising so other devices running this app can discover us.
     * The advertised name is what remote devices see in onEndpointFound().
     * serviceId MUST match between advertiser and discoverer — we use app package name.
     */
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

    /**
     * Starts scanning for nearby advertisers with matching serviceId.
     * Note (from docs): after calling stopDiscovery(), you can still requestConnection()
     * to peers already found — discovery only stops finding NEW peers.
     */
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

    /**
     * Shuts down Nearby fully:
     *  1. stopAdvertising() — stop being discoverable
     *  2. stopDiscovery()   — stop scanning
     *  3. stopAllEndpoints() — disconnect from ALL connected peers in one call
     *     (preferred over individual disconnectFromEndpoint() loops per docs)
     *  4. Shutdown all managers
     */
    @ReactMethod
    public void stop(Promise promise) {
        try {
            if (isModuleDestroyed) {
                Log.w(TAG, "Module already destroyed");
                if (promise != null) promise.resolve(true);
                return;
            }

            Log.d(TAG, "Stopping Nearby service...");

            if (connectionsClient != null) {
                try { connectionsClient.stopAdvertising(); }
                catch (Exception e) { Log.w(TAG, "stopAdvertising: " + e.getMessage()); }

                try { connectionsClient.stopDiscovery(); }
                catch (Exception e) { Log.w(TAG, "stopDiscovery: " + e.getMessage()); }

                // stopAllEndpoints() is the official way to disconnect all peers atomically.
                // More reliable than looping disconnectFromEndpoint() per endpoint.
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
            payloadFailCounts.clear(); // ← clear failure counters on stop
            // Keep endpointNameCache — useful if service restarts and finds same peers

            emitStatus("stopped");
            if (promise != null) promise.resolve(true);
            Log.d(TAG, "Nearby service stopped");
        } catch (Exception e) {
            Log.e(TAG, "stop error: " + e.getMessage(), e);
            if (promise != null) promise.reject("STOP_ERROR", e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  ADVERTISING (internal)
    // ─────────────────────────────────────────────────────────────────────────
    private void startAdvertisingInternal(String deviceName) {
        if (connectionsClient == null || isModuleDestroyed) return;

        AdvertisingOptions options = new AdvertisingOptions.Builder()
                .setStrategy(STRATEGY)
                .build();

        // Signature: startAdvertising(localEndpointName, serviceId, callback, options)
        // localEndpointName = what remote devices see; serviceId = app identifier
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
                    // Non-fatal: we're already advertising. Nothing to do.
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

    // ─────────────────────────────────────────────────────────────────────────
    //  DISCOVERY (internal)
    // ─────────────────────────────────────────────────────────────────────────
    private void startDiscoveryInternal() {
        if (connectionsClient == null || isModuleDestroyed) return;

        DiscoveryOptions options = new DiscoveryOptions.Builder()
                .setStrategy(STRATEGY)
                .build();

        // Signature: startDiscovery(serviceId, endpointDiscoveryCallback, options)
        // serviceId MUST match the advertiser's serviceId exactly.
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
                    // Non-fatal: already discovering. Nothing to do.
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

    // ─────────────────────────────────────────────────────────────────────────
    //  CONNECTION LIFECYCLE CALLBACK
    //
    //  From the docs:
    //  - onConnectionInitiated() fires on BOTH sides (discoverer + advertiser) symmetrically.
    //  - Both sides call acceptConnection() or rejectConnection() independently.
    //  - Connection is established only when BOTH sides have accepted.
    //  - onConnectionResult() delivers STATUS_OK / STATUS_CONNECTION_REJECTED / STATUS_ERROR.
    //  - onDisconnected() fires when a live connection is severed.
    // ─────────────────────────────────────────────────────────────────────────
    private final ConnectionLifecycleCallback connectionLifecycleCallback =
            new ConnectionLifecycleCallback() {

        @Override
        public void onConnectionInitiated(@NonNull String endpointId,
                                          @NonNull ConnectionInfo connectionInfo) {
            if (isModuleDestroyed) return;

            String remoteName = connectionInfo.getEndpointName();
            Log.d(TAG, "Connection initiated: " + endpointId + " (" + remoteName + ")");

            // Store name immediately — onConnectionResult arrives asynchronously and the
            // pendingConnectionNames map must be populated before that callback fires.
            pendingConnectionNames.put(endpointId, remoteName);
            endpointNameCache.put(endpointId, remoteName);

            // Both sides auto-accept (no user prompt needed for a scanner app).
            // payloadCallback is registered here — that's how Nearby knows where to
            // deliver incoming payloads from this specific endpoint.
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
                // Connection fully established — both sides accepted.
                connectedEndpoints.put(endpointId, deviceName);
                heartbeatManager.startHeartbeatForEndpoint(endpointId);
                reconnectionManager.clearAttempts(endpointId);
                reconnectionManager.clearAttemptsByName(deviceName);
                exhaustedEndpoints.remove(endpointId);
                // Reset failure counter for this endpoint — fresh connection, clean slate
                payloadFailCounts.put(endpointId, 0);

                Log.d(TAG, "Connected: " + deviceName + " (" + connectedEndpoints.size() + " total)");
                emitDebug("Connected to: " + deviceName);
                emitConnected(endpointId, deviceName);

            } else if (statusCode == ConnectionsStatusCodes.STATUS_CONNECTION_REJECTED) {
                // One or both sides rejected. Per docs this is a deliberate rejection,
                // not a transient error — do NOT retry. Restart discovery so the peer
                // can be found again if conditions change.
                Log.w(TAG, "Connection rejected by: " + deviceName);
                emitDebug("Connection rejected: " + deviceName);
                reconnectionManager.clearAttempts(endpointId);
                startDiscoveryInternal();
                startAdvertisingInternal(localDeviceName);

            } else if (statusCode == 8013) {
                // STATUS_ENDPOINT_UNKNOWN: this endpointId is stale/expired.
                // Nearby has forgotten it — retrying the same ID is pointless.
                // Clear and restart; peer will get a new endpointId on next discovery cycle.
                Log.w(TAG, "STATUS_ENDPOINT_UNKNOWN for " + deviceName + " — restarting discovery");
                reconnectionManager.clearAttempts(endpointId);
                startDiscoveryInternal();
                startAdvertisingInternal(localDeviceName);

            } else if (statusCode == ConnectionsStatusCodes.STATUS_ERROR) {
                // Connection broke before both sides could accept — transient error, safe to retry.
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

            Log.d(TAG, "Disconnected: " + deviceName);
            heartbeatManager.stopHeartbeatForEndpoint(endpointId);
            timeoutManager.cancelTimeout(endpointId);
            connectingEndpoints.remove(endpointId);
            // Remove failure counter — endpoint is gone
            payloadFailCounts.remove(endpointId);

            emitDisconnected(endpointId, deviceName);
            scheduleReconnection(endpointId, deviceName);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    //  ENDPOINT DISCOVERY CALLBACK
    //
    //  From the docs:
    //  - onEndpointFound() fires when an advertiser with matching serviceId appears.
    //  - onEndpointLost() fires when that advertiser disappears from radio range.
    //  - After stopDiscovery(), you can still requestConnection() to already-found peers.
    //  - Nearby may assign a NEW endpointId to the same physical device on rediscovery.
    // ─────────────────────────────────────────────────────────────────────────
    private final EndpointDiscoveryCallback endpointDiscoveryCallback =
            new EndpointDiscoveryCallback() {

        @Override
        public void onEndpointFound(@NonNull String endpointId,
                                    @NonNull DiscoveredEndpointInfo info) {
            if (isModuleDestroyed) return;

            String remoteName = info.getEndpointName();

            // Ignore own advertisement (P2P_CLUSTER: we advertise AND discover simultaneously)
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

            // Already connected — nothing to do
            if (connectedEndpoints.containsKey(endpointId)) {
                Log.d(TAG, "Already connected to " + remoteName + " — skipping");
                return;
            }

            // Already connecting to this exact endpointId
            if (connectingEndpoints.contains(endpointId)) {
                Log.w(TAG, "Already connecting to: " + remoteName + " (" + endpointId + ")");
                return;
            }

            // Double-discovery guard: Nearby sometimes fires onEndpointFound multiple times
            // for the same device name before connection completes (different endpointIds).
            for (String cId : connectingEndpoints) {
                String cName = endpointNameCache.getOrDefault(cId, "");
                if (cName.equals(remoteName)) {
                    Log.w(TAG, "Already connecting to " + remoteName + " via " + cId + " — skipping duplicate");
                    return;
                }
            }

            // New or rediscovered peer: clear any stale retry state for this endpointId.
            // Nearby assigns a fresh endpointId on every rediscovery — old retry loops
            // keyed by the old ID are irrelevant now.
            if (managersInitialized) {
                reconnectionManager.clearAttempts(endpointId);
                exhaustedEndpoints.remove(endpointId);
            }

            // Both sides initiate requestConnection — Nearby handles simultaneous calls
            // gracefully via STATUS_ALREADY_CONNECTED_TO_ENDPOINT.
            Log.d(TAG, "Initiating connection to: " + remoteName + " (" + endpointId + ")");
            connectingEndpoints.add(endpointId);
            requestConnectionInternal(endpointId, remoteName);
        }

        @Override
        public void onEndpointLost(@NonNull String endpointId) {
            if (isModuleDestroyed) return;
            // Per docs: endpoint left radio range. The endpointId is now invalid.
            // Do NOT schedule reconnection here — the peer must be re-advertised and
            // re-discovered (with a new endpointId) before we can connect again.
            // onDisconnected() already schedules reconnection for live connections.
            String name = endpointNameCache.getOrDefault(endpointId, endpointId);
            Log.d(TAG, "Endpoint lost: " + name + " — waiting for rediscovery");
            connectingEndpoints.remove(endpointId);
            // Do NOT remove from connectedEndpoints here — onDisconnected() handles that
            // for established connections. onEndpointLost only fires during discovery phase.
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    //  REQUEST CONNECTION (JS-callable + internal)
    // ─────────────────────────────────────────────────────────────────────────

    /** JS-callable manual connect (e.g. user picks a peer from a list). */
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

    /**
     * Internal requestConnection implementation.
     *
     * From the docs:
     *   requestConnection(localEndpointName, remoteEndpointId, connectionLifecycleCallback)
     *
     * The same connectionLifecycleCallback is used here as in startAdvertising().
     * After this call, BOTH sides receive onConnectionInitiated() and must both accept.
     *
     * Status codes handled:
     *   STATUS_ALREADY_CONNECTED_TO_ENDPOINT — our state is stale; purge and let reconnect
     *   STATUS_ALREADY_ADVERTISING/DISCOVERING — non-fatal info codes, not errors
     *   STATUS_ENDPOINT_UNKNOWN (8013) — stale endpointId; restart discovery
     *   Other failures — schedule exponential-backoff reconnect
     */
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
                        // Our local state is stale — Nearby thinks we're already connected.
                        // Purge the stale entry and disconnect, then let reconnection retry.
                        Log.d(TAG, "STATUS_ALREADY_CONNECTED to " + endpointName + " — purging stale state");
                        connectionsClient.disconnectFromEndpoint(endpointId);
                        connectedEndpoints.remove(endpointId);
                        connectingEndpoints.remove(endpointId);
                        return;
                    }

                    if (code == ConnectionsStatusCodes.STATUS_ALREADY_ADVERTISING
                            || code == ConnectionsStatusCodes.STATUS_ALREADY_DISCOVERING) {
                        // Non-fatal info code, not an error. No retry needed.
                        Log.d(TAG, "Non-fatal status " + code + " from requestConnection — ignoring");
                        connectingEndpoints.remove(endpointId);
                        return;
                    }

                    connectingEndpoints.remove(endpointId);
                    Log.w(TAG, "requestConnection failed for " + endpointName + " (code " + code + ")");

                    if (code == 8013) {
                        // STATUS_ENDPOINT_UNKNOWN: endpointId is expired. No point retrying it.
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

    // ─────────────────────────────────────────────────────────────────────────
    //  BROADCAST PAYLOAD  (to all connected peers)
    //
    //  From the docs:
    //  - Payload.Type.BYTES is limited to 32KB (ConnectionsClient.MAX_BYTES_DATA_SIZE).
    //  - sendPayload() is fire-and-forget; success/failure comes via onPayloadTransferUpdate.
    //  - For BYTES, onPayloadReceived() is called when the FULL payload is received
    //    (unlike STREAM/FILE which use onPayloadTransferUpdate for progress).
    //  - Each Payload has a unique ID. Create a FRESH Payload.fromBytes() per endpoint —
    //    reusing the same Payload object silently drops the second+ sendPayload() call.
    // ─────────────────────────────────────────────────────────────────────────
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

            // BYTES payloads are limited to 32KB by the Nearby Connections API.
            // Our scan payloads are ~200 bytes; this guard protects against future bloat.
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
                    // CRITICAL: Create a fresh Payload per endpoint.
                    // Payload.fromBytes() assigns a unique ID internally. Reusing the same
                    // Payload object means every call after the first is silently dropped —
                    // Nearby sees "already sent payload ID X" and ignores the duplicate.
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

    // ─────────────────────────────────────────────────────────────────────────
    //  SEND TO SPECIFIC ENDPOINT
    //
    //  Used for targeted sends — e.g. CATCHUP when a new peer connects.
    //  Sending CATCHUP only to the newly connected peer avoids triggering
    //  redundant ACKs from peers that are already fully synced.
    // ─────────────────────────────────────────────────────────────────────────
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
    //  Includes permission summary from PermissionsManager (API-level-aware).
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
            d.putInt("android_api",        android.os.Build.VERSION.SDK_INT);
            d.putString("local_name",      localDeviceName != null ? localDeviceName : "");
            d.putInt("connected_devices",  connectedEndpoints.size());
            d.putInt("connecting_devices", connectingEndpoints.size());
            d.putInt("exhausted_ids",      exhaustedEndpoints.size());
            d.putInt("cached_names",       endpointNameCache.size());
            d.putString("service_id",      SERVICE_ID);
            d.putString("strategy",        STRATEGY.toString());
            // API-level-aware permission summary (e.g. "BLUETOOTH_SCAN:Y BLUETOOTH_ADVERTISE:Y ...")
            d.putString("permissions",     permissionsManager.getPermissionsSummary(reactContext));
            d.putBoolean("all_perms_ok",   permissionsManager.hasAllNearbyPermissions(reactContext));
            Log.d(TAG, "Diagnostics: " + d.toString());
            promise.resolve(d);
        } catch (Exception e) {
            promise.reject("DIAGNOSTIC_ERROR", e.getMessage());
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  PAYLOAD CALLBACK
    //
    //  onPayloadReceived():
    //    For BYTES payloads, the ENTIRE payload is available immediately.
    //    No need to wait for onPayloadTransferUpdate — data is complete on receipt.
    //
    //  onPayloadTransferUpdate():
    //    For BYTES payloads on the SENDER side, this fires with either:
    //      PayloadTransferUpdate.Status.SUCCESS — payload fully delivered
    //      PayloadTransferUpdate.Status.FAILURE — transport dropped it (ghost SUCCESS)
    //
    //    Ghost SUCCESS: sendPayload() returned without exception (payload was accepted
    //    into the send queue) but the transport layer silently dropped it. The queue
    //    status SUCCESS is NOT the same as delivery SUCCESS. This callback tells the
    //    true story.
    //
    //    We track consecutive FAILURE updates per endpoint. After PAYLOAD_FAIL_THRESHOLD
    //    consecutive failures, we emit NearbyPayloadFailed to JS so forceReconnect()
    //    can tear down the stale channel immediately (~200-600ms) rather than waiting
    //    for ACK timeouts to fire (~20s).
    //
    //    A single SUCCESS resets the counter — the channel is still alive.
    // ─────────────────────────────────────────────────────────────────────────
    private final PayloadCallback payloadCallback = new PayloadCallback() {

        @Override
        public void onPayloadReceived(@NonNull String endpointId, @NonNull Payload payload) {
            if (isModuleDestroyed) return;

            // We only use BYTES payloads — no FILE or STREAM types in this app.
            if (payload.getType() != Payload.Type.BYTES) return;
            byte[] data = payload.asBytes();
            if (data == null) return;

            // Heartbeat byte: 0x00 or empty. Not forwarded to JS — handled internally.
            if (data.length == 0 || (data.length == 1 && data[0] == 0x00)) {
                heartbeatManager.recordHeartbeatReceived(endpointId);
                Log.d(TAG, "Heartbeat from: " + endpointNameCache.getOrDefault(endpointId, endpointId));
                return;
            }

            // Dedup by payloadId — Nearby can call onPayloadReceived multiple
            // times for the same payload on some Android versions.
            long payloadId = payload.getId();
            long nowMs     = System.currentTimeMillis();

            // Evict expired entries first
            seenPayloadIds.entrySet().removeIf(e -> nowMs - e.getValue() > PAYLOAD_DEDUP_TTL_MS);

            if (seenPayloadIds.containsKey(payloadId)) {
                Log.w(TAG, "Duplicate payloadId " + payloadId + " — dropped");
                return;
            }
            seenPayloadIds.put(payloadId, nowMs);

            // Real payload — decode and forward to JS
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
                // Channel is alive — reset the consecutive failure counter.
                // One good delivery is enough to prove the channel works.
                payloadFailCounts.put(endpointId, 0);
                Log.d(TAG, "PayloadTransferUpdate SUCCESS — endpoint: "
                    + endpointNameCache.getOrDefault(endpointId, endpointId));

            } else if (status == PayloadTransferUpdate.Status.FAILURE) {
                // Transport-level drop. sendPayload() reported no exception, but the
                // payload never reached the peer. This is the ghost SUCCESS signal.
                String deviceName = endpointNameCache.getOrDefault(endpointId, endpointId);

                int failures = payloadFailCounts.getOrDefault(endpointId, 0) + 1;
                payloadFailCounts.put(endpointId, failures);

                Log.w(TAG, "PayloadTransferUpdate FAILURE #" + failures
                    + " — endpoint: " + deviceName
                    + " (threshold: " + PAYLOAD_FAIL_THRESHOLD + ")");

                if (failures >= PAYLOAD_FAIL_THRESHOLD) {
                    // Confirmed stale channel — too many consecutive drops.
                    // Reset counter so we don't fire again immediately if reconnect
                    // takes a moment and a stray callback fires during teardown.
                    payloadFailCounts.put(endpointId, 0);

                    Log.e(TAG, "🔴 PAYLOAD_FAIL_THRESHOLD reached for " + deviceName
                        + " — emitting NearbyPayloadFailed to JS");
                    emitPayloadFailed(endpointId, deviceName, failures);
                }
            }
            // CANCELLED status (e.g. stream cancelled by sender) — ignore for BYTES
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    //  RECONNECTION & HEARTBEAT HELPERS
    // ─────────────────────────────────────────────────────────────────────────
    private void scheduleReconnection(String endpointId, String endpointName) {
        if (isModuleDestroyed || !managersInitialized) return;
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
        payloadFailCounts.remove(endpointId); // ← clean up on heartbeat-detected ghost

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

    /**
     * Emitted when PAYLOAD_FAIL_THRESHOLD consecutive send failures are detected
     * on one endpoint. JS side (NearbyConnectionServices) listens for this event
     * and calls forceReconnect() immediately — bypassing ACK timeout retries entirely.
     *
     * Timeline comparison:
     *   Before this fix: ghost SUCCESS → 4s wait → retry → 6s wait → retry → 10s wait → reconnect (~20s)
     *   After this fix:  ghost SUCCESS → 3 failed onPayloadTransferUpdate → reconnect (~200-600ms)
     */
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

    // Required stubs for RN 0.65+ NativeEventEmitter registration.
    // Without these, RN will warn "Module NearbyModule tried to remove event listeners"
    @ReactMethod public void addListener(String eventName) {}
    @ReactMethod public void removeListeners(Integer count) {}

    // ─────────────────────────────────────────────────────────────────────────
    //  LIFECYCLE
    // ─────────────────────────────────────────────────────────────────────────
    @Override
    public void invalidate() {
        super.invalidate();
        Log.d(TAG, "Module invalidate called");
        isModuleDestroyed = true;
        try { stop(null); } catch (Exception e) { Log.e(TAG, "Error during invalidate: " + e.getMessage()); }
        Log.d(TAG, "Module destroyed");
    }
}