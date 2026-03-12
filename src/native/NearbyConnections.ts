import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

// ─── Types ────────────────────────────────────────────────────
export interface NearbyDevice {
  endpointId: string;
  deviceName: string;
}

export interface NearbyPayloadEvent {
  endpointId: string;
  payload: string; // JSON string
}

// ─── Native module reference ──────────────────────────────────
// ─── Native module reference ──────────────────────────────────
const { NearbyModule: Native } = NativeModules;

// Native module is only available in EAS builds — not in local dev builds.
// All API calls are no-ops when unavailable, so the app runs normally.
export const isNearbyAvailable = !!Native;

if (!Native && __DEV__) {
  console.log('[NearbyModule] Running without Nearby module (local dev build) — mesh features disabled.');
}

// ─── Event emitter ────────────────────────────────────────────
export const NearbyEmitter = Native
  ? new NativeEventEmitter(Native)
  : null;

// ─── Event names ─────────────────────────────────────────────
export const NEARBY_EVENTS = {
  CONNECTED: 'NearbyConnected',
  DISCONNECTED: 'NearbyDisconnected',
  PAYLOAD: 'NearbyPayloadReceived',
  STATUS: 'NearbyStatusChanged',
  RECONNECT: 'NearbyReconnecting',
  PERMISSION: 'NearbyPermissionError',
  DEBUG: 'NearbyDebug',
} as const;

// ─── API ──────────────────────────────────────────────────────
export async function nearbyCheckPermissions(): Promise<string[]> {
  if (!Native) return [];
  return await Native.checkPermissions();
}

export async function nearbyRequestPermissions(): Promise<boolean> {
  if (!Native) return true;
  return await Native.requestPermissions();
}

export async function nearbyStart(deviceName: string): Promise<boolean> {
  if (!Native) return false;
  try {
    console.log('[NearbyModule] Initializing service...');
    // In our new architecture, this just initializes managers and permissions
    return await Native.start(deviceName);
  } catch (e) {
    console.error('[NearbyModule] start error:', e);
    return false;
  }
}

export async function nearbyStartAdvertising(deviceName: string): Promise<boolean> {
  if (!Native) return false;
  try {
    console.log('[NearbyModule] Starting advertising...');
    return await Native.startAdvertising(deviceName);
  } catch (e) {
    console.error('[NearbyModule] startAdvertising error:', e);
    return false;
  }
}

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

export async function nearbyStop(): Promise<void> {
  if (!Native) return;
  try {
    console.log('[NearbyModule] Stopping service...');
    await Native.stop();
  } catch (e) {
    console.error('[NearbyModule] stop error:', e);
  }
}

export async function nearbyBroadcast(payload: object): Promise<boolean> {
  if (!Native) return false;
  try {
    const json = JSON.stringify(payload);
    console.log('[NearbyModule] Broadcasting payload:', json);
    return await Native.broadcastPayload(json);
  } catch (e) {
    console.error('[NearbyModule] broadcast error:', e);
    return false;
  }
}

export async function nearbyGetDevices(): Promise<NearbyDevice[]> {
  if (!Native) return [];
  try {
    const devices = await Native.getConnectedDevices();
    return devices;
  } catch (e) {
    console.error('[NearbyModule] getConnectedDevices error:', e);
    return [];
  }
}

export async function nearbyGetDiagnostics(): Promise<any> {
  if (!Native) return null;
  try {
    return await Native.getDiagnostics();
  } catch (e) {
    console.error('[NearbyModule] getDiagnostics error:', e);
    return null;
  }
}