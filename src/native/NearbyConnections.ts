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

// ─── Native module reference ──────────────────────────────────────────────────
const { NearbyModule: Native } = NativeModules;

// Native module is only available in EAS/production builds — not in Expo Go.
// All API calls are no-ops when unavailable so the app still runs in dev.
export const isNearbyAvailable = !!Native;

if (!Native && __DEV__) {
  console.log('[NearbyModule] No native module found (local dev build) — mesh features disabled.');
}

// ─── Event emitter ────────────────────────────────────────────────────────────
export const NearbyEmitter = Native
  ? new NativeEventEmitter(Native)
  : null;

// ─── Event names (must match Java EVENT_* constants exactly) ─────────────────
export const NEARBY_EVENTS = {
  CONNECTED:    'NearbyConnected',
  DISCONNECTED: 'NearbyDisconnected',
  PAYLOAD:      'NearbyPayloadReceived',
  STATUS:       'NearbyStatusChanged',
  RECONNECT:    'NearbyReconnecting',
  PERMISSION:   'NearbyPermissionError',
  DEBUG:        'NearbyDebug',
  DEVICE_FOUND: 'NearbyDeviceFound',
} as const;

// ─── Permission check ─────────────────────────────────────────────────────────
export async function nearbyCheckPermissions(): Promise<string[]> {
  if (!Native) return [];
  return await Native.checkPermissions();
}

// FIX #10: Added BLUETOOTH_ADVERTISE which was missing from JS-side permission request
export async function nearbyRequestPermissions(): Promise<boolean> {
  if (!Native) return true;

  if (Platform.OS === 'android') {
    const { PermissionsAndroid } = require('react-native');
    const apiLevel = parseInt(String(Platform.Version), 10);

    // API 31+ requires granular BT permissions
    const permissions = apiLevel >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,  // ← was missing
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES,
        ]
      : [
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ];

    const results = await PermissionsAndroid.requestMultiple(permissions);

    const allGranted = Object.values(results).every(
      (status) => status === PermissionsAndroid.RESULTS.GRANTED
    );

    if (!allGranted) {
      console.warn('[NearbyModule] Some permissions denied:', results);
    }

    return allGranted;
  }

  // iOS — permissions handled by the OS on first use
  return await Native.requestPermissions();
}

// ─── Core API ─────────────────────────────────────────────────────────────────
export async function nearbyStart(deviceName: string): Promise<boolean> {
  if (!Native) return false;
  try {
    return await Native.start(deviceName);
  } catch (e) {
    console.error('[NearbyModule] start error:', e);
    return false;
  }
}

export async function nearbyStartAdvertising(deviceName: string): Promise<boolean> {
  if (!Native) return false;
  try {
    return await Native.startAdvertising(deviceName);
  } catch (e) {
    console.error('[NearbyModule] startAdvertising error:', e);
    return false;
  }
}

export async function nearbyStartDiscovery(): Promise<boolean> {
  if (!Native) return false;
  try {
    return await Native.startDiscovery();
  } catch (e) {
    console.error('[NearbyModule] startDiscovery error:', e);
    return false;
  }
}

export async function nearbyStop(): Promise<void> {
  if (!Native) return;
  try {
    await Native.stop();
  } catch (e) {
    console.error('[NearbyModule] stop error:', e);
  }
}

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

export async function nearbyConnect(endpointId: string, deviceName: string): Promise<boolean> {
  if (!Native) return false;
  try {
    return await Native.requestConnection(endpointId, deviceName);
  } catch (e) {
    console.error('[NearbyModule] requestConnection error:', e);
    return false;
  }
}

export async function nearbyGetDevices(): Promise<NearbyDevice[]> {
  if (!Native) return [];
  try {
    return await Native.getConnectedDevices();
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