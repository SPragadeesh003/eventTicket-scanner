import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import {
  NearbyDevice,
  NearbyPayloadEvent,
  NearbyReconnectEvent,
  NearbyPermissionError,
  NearbyDiagnostics
} from '@/src/types/Nearby.types';

const { NearbyModule: Native } = NativeModules;
export const isNearbyAvailable = !!Native;

if (!Native && __DEV__) {
  console.log(
    '[NearbyModule] Running without Nearby module (local dev build) — mesh features disabled.'
  );
}

export const NearbyEmitter: NativeEventEmitter | null = Native
  ? new NativeEventEmitter(Native)
  : null;

export const NEARBY_EVENTS = {
  CONNECTED: 'NearbyConnected',
  DISCONNECTED: 'NearbyDisconnected',
  PAYLOAD: 'NearbyPayloadReceived',
  STATUS: 'NearbyStatusChanged',
  RECONNECT: 'NearbyReconnecting',
  PERMISSION: 'NearbyPermissionError',
  DEBUG: 'NearbyDebug',
  DEVICE_FOUND: 'NearbyDeviceFound',
} as const;

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
    console.log('[NearbyModule] Initializing service as:', deviceName);
    return await Native.start(deviceName);
  } catch (e) {
    console.error('[NearbyModule] start error:', e);
    return false;
  }
}

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
    return await Native.broadcastPayload(json);
  } catch (e) {
    console.error('[NearbyModule] broadcast error:', e);
    return false;
  }
}

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

export async function nearbyGetDevices(): Promise<NearbyDevice[]> {
  if (!Native) return [];
  try {
    return await Native.getConnectedDevices();
  } catch (e) {
    console.error('[NearbyModule] getConnectedDevices error:', e);
    return [];
  }
}

export async function nearbyGetDiagnostics(): Promise<NearbyDiagnostics | null> {
  if (!Native) return null;
  try {
    return await Native.getDiagnostics();
  } catch (e) {
    console.error('[NearbyModule] getDiagnostics error:', e);
    return null;
  }
}