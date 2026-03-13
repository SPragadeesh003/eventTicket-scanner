import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NearbyDevice {
  endpointId: string;
  deviceName: string;
}

export interface NearbyPayloadEvent {
  endpointId: string;
  payload: string; // JSON string
}

export interface NearbyReconnectEvent {
  endpointId: string; // device name (human-readable, from endpointNameCache)
  attempt: number;
}

export interface NearbyPermissionError {
  missing: string; // comma-separated permission names
}

export interface NearbyDiagnostics {
  device_model:      string;
  android_api:       number;
  local_name:        string;
  connected_devices: number;
  connecting_devices:number;
  exhausted_ids:     number;
  cached_names:      number;
  service_id:        string;
  strategy:          string;
  permissions:       string; // e.g. "BLUETOOTH_SCAN:Y NEARBY_WIFI_DEVICES:Y ..."
  all_perms_ok:      boolean;
}

// ─── Native module reference ──────────────────────────────────────────────────

const { NearbyModule: Native } = NativeModules;

/**
 * True if the Nearby native module is bundled (EAS/release builds).
 * In local Expo Go / dev builds, the native module is unavailable — all API
 * calls are no-ops so the app still runs with mesh features disabled.
 */
export const isNearbyAvailable = !!Native;

if (!Native && __DEV__) {
  console.log(
    '[NearbyModule] Running without Nearby module (local dev build) — mesh features disabled.'
  );
}

// ─── Event emitter ────────────────────────────────────────────────────────────

export const NearbyEmitter: NativeEventEmitter | null = Native
  ? new NativeEventEmitter(Native)
  : null;

// ─── Event name constants ─────────────────────────────────────────────────────

export const NEARBY_EVENTS = {
  /** Fired when a connection is fully established (both sides accepted). */
  CONNECTED:    'NearbyConnected',
  /** Fired when an established connection is severed. */
  DISCONNECTED: 'NearbyDisconnected',
  /** Fired when a BYTES payload arrives from a peer. */
  PAYLOAD:      'NearbyPayloadReceived',
  /** Generic status string changes (e.g. "stopped", "reconnect_failed_Gate1"). */
  STATUS:       'NearbyStatusChanged',
  /** Fired on each reconnect attempt. Payload: { endpointId: deviceName, attempt: number } */
  RECONNECT:    'NearbyReconnecting',
  /** Fired when a required permission is missing at start/advertise/discover time. */
  PERMISSION:   'NearbyPermissionError',
  /** Internal debug log messages forwarded to JS for dev tooling. */
  DEBUG:        'NearbyDebug',
  /** Fired in onEndpointFound — a nearby advertiser was discovered (not yet connected). */
  DEVICE_FOUND: 'NearbyDeviceFound',
} as const;

// ─── Permission API ───────────────────────────────────────────────────────────

/**
 * Returns the list of Nearby permissions that are required for this device's
 * API level but not yet granted. Empty array = all good.
 *
 * PermissionsManager on the Java side applies the official SDK-level gate:
 *   - BLUETOOTH / BLUETOOTH_ADMIN   only checked on API <= 30
 *   - ACCESS_FINE_LOCATION          only checked on API 29–31
 *   - BLUETOOTH_SCAN/ADVERTISE/CONNECT only checked on API >= 31
 *   - NEARBY_WIFI_DEVICES           only checked on API >= 32
 */
export async function nearbyCheckPermissions(): Promise<string[]> {
  if (!Native) return [];
  return await Native.checkPermissions();
}

/**
 * Triggers Android runtime permission request for all missing Nearby permissions.
 * Only requests permissions applicable to the current API level.
 * Returns true if the request was dispatched (not whether user granted them).
 */
export async function nearbyRequestPermissions(): Promise<boolean> {
  if (!Native) return true;
  return await Native.requestPermissions();
}

// ─── Service lifecycle ────────────────────────────────────────────────────────

/**
 * Initializes the ConnectionsClient and heartbeat scheduler.
 * Must be called before startAdvertising() or startDiscovery().
 * Rejects if required permissions for this API level are not granted.
 */
export async function nearbyStart(deviceName: string): Promise<boolean> {
  if (!Native) return false;
  try {
    console.log('[NearbyModule] Initializing service as:', deviceName);
    return await Native.start(deviceName);
  } catch (e) {
    console.error('[NearbyModule] start error:', e);
    return false;
  }
}

/**
 * Starts BLE advertising with the given device name.
 * Other devices running this app will see this name in their onEndpointFound callback.
 * Handles STATUS_ALREADY_ADVERTISING gracefully (non-fatal).
 */
export async function nearbyStartAdvertising(deviceName: string): Promise<boolean> {
  if (!Native) return false;
  try {
    console.log('[NearbyModule] Starting advertising as:', deviceName);
    return await Native.startAdvertising(deviceName);
  } catch (e) {
    console.error('[NearbyModule] startAdvertising error:', e);
    return false;
  }
}

/**
 * Starts scanning for nearby advertisers with matching serviceId.
 * Note: after calling stopDiscovery(), you can still requestConnection() to
 * peers already found — stopDiscovery only stops finding NEW peers.
 * Handles STATUS_ALREADY_DISCOVERING gracefully (non-fatal).
 */
export async function nearbyStartDiscovery(): Promise<boolean> {
  if (!Native) return false;
  try {
    console.log('[NearbyModule] Starting discovery...');
    return await Native.startDiscovery();
  } catch (e) {
    console.error('[NearbyModule] startDiscovery error:', e);
    return false;
  }
}

/**
 * Shuts down Nearby fully:
 *   stopAdvertising() + stopDiscovery() + stopAllEndpoints() + manager shutdown.
 * Safe to call multiple times.
 */
export async function nearbyStop(): Promise<void> {
  if (!Native) return;
  try {
    console.log('[NearbyModule] Stopping service...');
    await Native.stop();
  } catch (e) {
    console.error('[NearbyModule] stop error:', e);
  }
}

// ─── Payload API ──────────────────────────────────────────────────────────────

/**
 * Broadcast a JSON payload to ALL currently connected peers.
 * Uses Payload.Type.BYTES — limited to 32KB by the Nearby Connections API.
 * Creates a fresh Payload instance per endpoint (required — Nearby tracks by payload ID).
 *
 * Returns true if at least one peer received the send call successfully.
 */
export async function nearbyBroadcast(payload: object): Promise<boolean> {
  if (!Native) return false;
  try {
    const json = JSON.stringify(payload);
    return await Native.broadcastPayload(json);
  } catch (e) {
    console.error('[NearbyModule] broadcast error:', e);
    return false;
  }
}

/**
 * Send a JSON payload to ONE specific endpoint (by endpointId).
 * Used for targeted sends — e.g. CATCHUP when a new peer connects.
 * Avoids triggering redundant ACKs from peers that are already synced.
 *
 * Limited to 32KB (BYTES type). Returns false if endpoint not connected.
 */
export async function nearbyBroadcastToEndpoint(
  endpointId: string,
  payload: object
): Promise<boolean> {
  if (!Native) return false;
  try {
    const json = JSON.stringify(payload);
    return await Native.sendToEndpoint(endpointId, json);
  } catch (e) {
    console.error('[NearbyModule] sendToEndpoint error:', e);
    return false;
  }
}

// ─── Connection API ───────────────────────────────────────────────────────────

/**
 * Manually request a connection to a specific endpoint (e.g. user picks from list).
 * In normal mesh operation this is handled automatically in onEndpointFound.
 */
export async function nearbyConnect(
  endpointId: string,
  deviceName: string
): Promise<boolean> {
  if (!Native) return false;
  try {
    console.log('[NearbyModule] Manually connecting to:', deviceName);
    return await Native.requestConnection(endpointId, deviceName);
  } catch (e) {
    console.error('[NearbyModule] requestConnection error:', e);
    return false;
  }
}

/**
 * Returns all currently connected peers (STATUS_OK connections only).
 * Does not include peers that are connecting, discovered-but-not-connected, or disconnecting.
 */
export async function nearbyGetDevices(): Promise<NearbyDevice[]> {
  if (!Native) return [];
  try {
    return await Native.getConnectedDevices();
  } catch (e) {
    console.error('[NearbyModule] getConnectedDevices error:', e);
    return [];
  }
}

// ─── Diagnostics ──────────────────────────────────────────────────────────────

/**
 * Returns a diagnostics object with device info, connection counts, and
 * an API-level-aware permission summary (e.g. "BLUETOOTH_SCAN:Y NEARBY_WIFI_DEVICES:Y").
 */
export async function nearbyGetDiagnostics(): Promise<NearbyDiagnostics | null> {
  if (!Native) return null;
  try {
    return await Native.getDiagnostics();
  } catch (e) {
    console.error('[NearbyModule] getDiagnostics error:', e);
    return null;
  }
}