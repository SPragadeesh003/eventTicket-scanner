import { Alert, EmitterSubscription, PermissionsAndroid, Platform } from 'react-native';
import { Q }           from '@nozbe/watermelondb';
import { database }    from '@/src/db/database';
import { getDeviceId } from '@/src/utils/DeviceID';
import type { Ticket, ScanLog } from '@/src/db/models';
import {
  nearbyStart,
  nearbyStop,
  nearbyBroadcast,
  nearbyGetDevices,
  NearbyEmitter,
  NEARBY_EVENTS,
  isNearbyAvailable,
  type NearbyDevice,
} from '@/src/native/NearbyConnections';

// ─── Payload shape shared between devices ─────────────────────
export interface ScanPayload {
  type:       'SCAN';
  ticketId:   string;
  eventId:    string;
  deviceId:   string;
  deviceName: string;
  scannedAt:  number; // epoch ms — used for first-scan-wins
}

// ─── Callbacks the app can subscribe to ──────────────────────
export interface NearbyCallbacks {
  onTicketScannedByPeer?: (payload: ScanPayload) => void;
  onDeviceConnected?:    (device: NearbyDevice)  => void;
  onDeviceDisconnected?: (device: NearbyDevice)  => void;
}

// ─── Service state ────────────────────────────────────────────
let subscriptions: EmitterSubscription[] = [];
let callbacks:     NearbyCallbacks = {};
let isRunning      = false;

// ─────────────────────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────────────────────
export async function startNearbyService(cb: NearbyCallbacks = {}): Promise<void> {
  if (isRunning) return;
  callbacks = cb;

  // Native module not available in local dev builds — skip silently
  if (!isNearbyAvailable) {
    isRunning = true;
    return;
  }

  // ✨ NEW: Request permissions if on Android
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES,
      ]);

      const allGranted = Object.values(granted).every(
        (status) => status === PermissionsAndroid.RESULTS.GRANTED
      );

      if (!allGranted) {
        Alert.alert(
          'Permissions Required',
          'Nearby device mesh requires Bluetooth and Location permissions to function.',
          [{ text: 'OK' }]
        );
        isRunning = true;
        return;
      }
    } catch (err) {
      console.error('[Nearby] Permission request error:', err);
      isRunning = true;
      return;
    }
  }

  const deviceId   = await getDeviceId();
  const deviceName = `Scanner-${deviceId.slice(-4).toUpperCase()}`;

  if (!NearbyEmitter) return;

  // ── Listen: payload received from peer ──────────────────────
  subscriptions.push(
    NearbyEmitter.addListener(NEARBY_EVENTS.PAYLOAD, async (event: { endpointId: string; payload: string }) => {
      try {
        const data = JSON.parse(event.payload) as ScanPayload;
        if (data.type === 'SCAN') {
          await handleIncomingScan(data);
        }
      } catch (e) {
        console.error('[Nearby] bad payload:', e);
      }
    })
  );

  // ── Listen: device connected ─────────────────────────────────
  subscriptions.push(
    NearbyEmitter.addListener(NEARBY_EVENTS.CONNECTED, (device: NearbyDevice) => {
      console.log('[Nearby] connected:', device.deviceName);
      callbacks.onDeviceConnected?.(device);
    })
  );

  // ── Listen: device disconnected ──────────────────────────────
  subscriptions.push(
    NearbyEmitter.addListener(NEARBY_EVENTS.DISCONNECTED, (device: NearbyDevice) => {
      console.log('[Nearby] disconnected:', device.deviceName);
      callbacks.onDeviceDisconnected?.(device);
    })
  );

  // ── Listen: Debug/Status events ───────────────────────────────
  subscriptions.push(
    NearbyEmitter.addListener('NearbyDebug', (event: { message: string }) => {
      console.log('[Nearby DEBUG]', event.message);
    })
  );

  subscriptions.push(
    NearbyEmitter.addListener('NearbyReconnecting', (event: { endpointId: string; attempt: number }) => {
      console.log(`[Nearby] Reconnecting to ${event.endpointId} (Attempt ${event.attempt})`);
    })
  );

  subscriptions.push(
    NearbyEmitter.addListener('NearbyPermissionError', (event: { missing: string }) => {
      console.error('[Nearby ERROR] Permissions missing:', event.missing);
      Alert.alert('Permission Error', `Missing native permissions: ${event.missing}`);
    })
  );

  await nearbyStart(deviceName);
  isRunning = true;
  console.log('[Nearby] service started as', deviceName);
}

// ─────────────────────────────────────────────────────────────
//  STOP
// ─────────────────────────────────────────────────────────────
export async function stopNearbyService(): Promise<void> {
  subscriptions.forEach(s => s.remove());
  subscriptions = [];
  callbacks     = {};
  isRunning     = false;
  await nearbyStop();
  console.log('[Nearby] service stopped');
}

// ─────────────────────────────────────────────────────────────
//  BROADCAST — call after every valid scan
// ─────────────────────────────────────────────────────────────
export async function broadcastScan(
  ticketId:   string,
  eventId:    string,
  deviceName: string,
): Promise<void> {
  const deviceId  = await getDeviceId();
  const payload: ScanPayload = {
    type:       'SCAN',
    ticketId,
    eventId,
    deviceId,
    deviceName,
    scannedAt:  Date.now(),
  };
  await nearbyBroadcast(payload);
}

// ─────────────────────────────────────────────────────────────
//  HANDLE INCOMING SCAN (first-scan-wins conflict resolution)
// ─────────────────────────────────────────────────────────────
async function handleIncomingScan(data: ScanPayload): Promise<void> {
  try {
    const tickets = await database
      .get<Ticket>('tickets')
      .query(
        Q.where('ticket_id', data.ticketId),
        Q.where('event_id',  data.eventId),
      )
      .fetch();

    if (tickets.length === 0) return; // not in our local DB

    const ticket = tickets[0];

    // ── Conflict resolution: first-scan-wins ──────────────────
    // Check if we have a local scan log for this ticket
    const existingLogs = await database
      .get<ScanLog>('scan_logs')
      .query(Q.where('ticket_id', data.ticketId))
      .fetch();

    if (existingLogs.length > 0) {
      // We already have a scan — check timestamps
      const ourScanTime   = existingLogs[0].scanned_at;
      const theirScanTime = data.scannedAt;

      if (ourScanTime <= theirScanTime) {
        // Our scan was first — we win, ignore peer's scan
        console.log('[Nearby] we scanned first, ignoring peer scan for', data.ticketId);
        return;
      }
      // Their scan was first — they win, update our record
    }

    // Mark ticket as used in our WatermelonDB
    if (ticket.status !== 'used') {
      await database.write(async () => {
        await ticket.update((t: Ticket) => { t.status = 'used'; });
      });
      console.log('[Nearby] marked used from peer scan:', data.ticketId);
    }

    // Notify the app (scanner screen updates its stats)
    callbacks.onTicketScannedByPeer?.(data);

  } catch (e) {
    console.error('[Nearby] handleIncomingScan error:', e);
  }
}

// ─────────────────────────────────────────────────────────────
//  GET CONNECTED DEVICES (for SyncStatus screen)
// ─────────────────────────────────────────────────────────────
export async function getConnectedDevices(): Promise<NearbyDevice[]> {
  return nearbyGetDevices();
}