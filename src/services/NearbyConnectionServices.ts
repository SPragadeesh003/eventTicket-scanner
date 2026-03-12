import {
  Alert,
  EmitterSubscription,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Q } from '@nozbe/watermelondb';
import { database } from '@/src/db/database';
import { getDeviceId, } from '@/src/utils/DeviceID';
import type { Ticket, ScanLog } from '@/src/db/models';
import {
  nearbyStart,
  nearbyStop,
  nearbyBroadcast,
  nearbyGetDevices,
  nearbyConnect,
  nearbyStartAdvertising,
  nearbyStartDiscovery,
  nearbyRequestPermissions,
  NearbyEmitter,
  NEARBY_EVENTS,
  isNearbyAvailable,
  type NearbyDevice,
} from '@/src/native/NearbyConnections';

// ─── Storage key for gate number ─────────────────────────────────────────────
const GATE_NUMBER_KEY = '@gate_number';

// ─── Payload shape ────────────────────────────────────────────────────────────
export interface ScanPayload {
  type:       'SCAN';
  ticketId:   string;
  eventId:    string;
  deviceId:   string;   // stable unique ID of the scanning device
  deviceName: string;   // human-readable gate name e.g. "Gate-3-A1B2"
  scannedAt:  number;   // epoch ms — used for first-scan-wins conflict resolution
}

// ─── Callbacks ────────────────────────────────────────────────────────────────
export interface NearbyCallbacks {
  onTicketScannedByPeer?: (payload: ScanPayload) => void;
  onDeviceConnected?:    (device: NearbyDevice)  => void;
  onDeviceDisconnected?: (device: NearbyDevice)  => void;
  onDeviceFound?:        (device: NearbyDevice)  => void;
}

// ─── Service state ────────────────────────────────────────────────────────────
let subscriptions:    EmitterSubscription[] = [];
let callbacks:        NearbyCallbacks = {};
let isRunning         = false;
let localDeviceName   = '';  // cached after start
let localDeviceId     = '';  // cached after start
let discoveredPeers:  NearbyDevice[] = [];

// ─────────────────────────────────────────────────────────────────────────────
//  GATE NUMBER HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// FIX #5: Gate number is configurable — no longer hardcoded as "Gate-1"
// Set this before calling startNearbyService(), or call setGateNumber() explicitly
export async function setGateNumber(number: number): Promise<void> {
  await AsyncStorage.setItem(GATE_NUMBER_KEY, String(number));
  console.log(`[Nearby] Gate number set to: ${number}`);
}

export async function getGateNumber(): Promise<number> {
  const stored = await AsyncStorage.getItem(GATE_NUMBER_KEY);
  return stored ? parseInt(stored, 10) : 1;
}

// ─────────────────────────────────────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────────────────────────────────────
export async function startNearbyService(cb: NearbyCallbacks = {}): Promise<void> {
  callbacks = cb;

  if (isRunning) {
    // Re-attach listeners if they were cleared
    if (subscriptions.length === 0) attachListeners();
    return;
  }

  if (!isNearbyAvailable) {
    console.log('[Nearby] Module not available (dev build) — mesh disabled');
    isRunning = true;
    return;
  }

  // FIX #10: Request all permissions including BLUETOOTH_ADVERTISE
  if (Platform.OS === 'android') {
    const granted = await nearbyRequestPermissions();
    if (!granted) {
      Alert.alert(
        'Permissions Required',
        'Bluetooth and Location permissions are required for multi-gate sync.',
        [{ text: 'OK' }]
      );
      isRunning = true;
      return;
    }
  }

  // FIX #5: Build device name with correct gate number from storage
  localDeviceId = await getDeviceId();
  const gateNumber = await getGateNumber();
  const suffix = localDeviceId.slice(-4).toUpperCase();
  localDeviceName = `Gate-${gateNumber}-${suffix}`;

  attachListeners();

  await nearbyStart(localDeviceName);
  await nearbyStartAdvertising(localDeviceName);
  await nearbyStartDiscovery();

  isRunning = true;
  console.log(`[Nearby] ✅ Mesh started as: ${localDeviceName}`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  ATTACH LISTENERS
// ─────────────────────────────────────────────────────────────────────────────
function attachListeners(): void {
  if (!NearbyEmitter) return;

  subscriptions.forEach(s => s.remove());
  subscriptions = [];

  // ── Payload received from peer ──────────────────────────────────────────
  subscriptions.push(
    NearbyEmitter.addListener(
      NEARBY_EVENTS.PAYLOAD,
      async (event: { endpointId: string; payload: string }) => {
        try {
          const data = JSON.parse(event.payload) as ScanPayload;
          if (data.type === 'SCAN') {
            await handleIncomingScan(data);
          }
        } catch (e) {
          console.error('[Nearby] Bad payload:', e);
        }
      }
    )
  );

  // ── Connected ───────────────────────────────────────────────────────────
  subscriptions.push(
    NearbyEmitter.addListener(NEARBY_EVENTS.CONNECTED, (device: NearbyDevice) => {
      console.log('[Nearby] ✅ Connected:', device.deviceName);
      discoveredPeers = discoveredPeers.filter(p => p.endpointId !== device.endpointId);
      callbacks.onDeviceConnected?.(device);
      // Sync recent scans with newly joined peer
      syncWithNewPeer(device.deviceName);
    })
  );

  // ── Device found (not yet connected) ───────────────────────────────────
  subscriptions.push(
    NearbyEmitter.addListener(NEARBY_EVENTS.DEVICE_FOUND, (device: NearbyDevice) => {
      if (!discoveredPeers.find(p => p.endpointId === device.endpointId)) {
        discoveredPeers.push(device);
      }
      console.log('[Nearby] Found nearby:', device.deviceName);
      callbacks.onDeviceFound?.(device);
    })
  );

  // ── Disconnected ────────────────────────────────────────────────────────
  subscriptions.push(
    NearbyEmitter.addListener(NEARBY_EVENTS.DISCONNECTED, (device: NearbyDevice) => {
      console.log('[Nearby] ❌ Disconnected:', device.deviceName);
      discoveredPeers = discoveredPeers.filter(p => p.endpointId !== device.endpointId);
      callbacks.onDeviceDisconnected?.(device);
    })
  );

  // ── Debug ───────────────────────────────────────────────────────────────
  subscriptions.push(
    NearbyEmitter.addListener(NEARBY_EVENTS.DEBUG, (event: { message: string }) => {
      console.log('[Nearby DEBUG]', event.message);
    })
  );

  subscriptions.push(
    NearbyEmitter.addListener(
      NEARBY_EVENTS.RECONNECT,
      (event: { endpointId: string; attempt: number }) => {
        console.log(`[Nearby] Reconnecting to ${event.endpointId} attempt ${event.attempt}`);
      }
    )
  );

  subscriptions.push(
    NearbyEmitter.addListener(
      NEARBY_EVENTS.PERMISSION,
      (event: { missing: string }) => {
        console.error('[Nearby] Permission error:', event.missing);
        Alert.alert('Permission Error', `Missing permissions:\n${event.missing}`);
      }
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  STOP
// ─────────────────────────────────────────────────────────────────────────────
export function stopListening(): void {
  subscriptions.forEach(s => s.remove());
  subscriptions = [];
  callbacks = {};
}

export async function stopNearbyService(): Promise<void> {
  stopListening();
  isRunning = false;
  discoveredPeers = [];
  await nearbyStop();
  console.log('[Nearby] Service stopped');
}

// ─────────────────────────────────────────────────────────────────────────────
//  BROADCAST SCAN (call after every successful local scan)
// ─────────────────────────────────────────────────────────────────────────────
export async function broadcastScan(
  ticketId: string,
  eventId:  string,
): Promise<void> {
  // FIX #12: Use cached device ID — no AsyncStorage read on hot path
  const payload: ScanPayload = {
    type:       'SCAN',
    ticketId,
    eventId,
    deviceId:   localDeviceId,
    deviceName: localDeviceName,
    scannedAt:  Date.now(),
  };
  await nearbyBroadcast(payload);
}

// ─────────────────────────────────────────────────────────────────────────────
//  SYNC WITH NEW PEER
// ─────────────────────────────────────────────────────────────────────────────
async function syncWithNewPeer(peerName: string): Promise<void> {
  try {
    const thirtyMinsAgo = Date.now() - 30 * 60 * 1000;

    // FIX #8: Only sync scans from THIS device — not ones received from peers
    // Prevents echo loops where Device A sends a peer scan back to Device B
    const myLogs = await database
      .get<ScanLog>('scan_logs')
      .query(
        Q.where('scanned_at', Q.gt(thirtyMinsAgo)),
        Q.where('device_id', localDeviceId),  // ← only own scans
      )
      .fetch();

    if (myLogs.length === 0) return;

    console.log(`[Nearby] Syncing ${myLogs.length} own scans with new peer: ${peerName}`);

    for (const log of myLogs) {
      const payload: ScanPayload = {
        type:       'SCAN',
        ticketId:   log.ticket_id,
        eventId:    log.event_id,
        deviceId:   localDeviceId,
        deviceName: localDeviceName,
        scannedAt:  log.scanned_at,
      };
      await nearbyBroadcast(payload);
      // Throttle to prevent native payload buffer overflow
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  } catch (e) {
    console.error('[Nearby] syncWithNewPeer error:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  HANDLE INCOMING SCAN (first-scan-wins conflict resolution)
// ─────────────────────────────────────────────────────────────────────────────
async function handleIncomingScan(data: ScanPayload): Promise<void> {
  try {
    // Ignore our own broadcasts echoed back (shouldn't happen but guard anyway)
    if (data.deviceId === localDeviceId) return;

    const tickets = await database
      .get<Ticket>('tickets')
      .query(
        Q.where('ticket_id', data.ticketId),
        Q.where('event_id',  data.eventId),
      )
      .fetch();

    if (tickets.length === 0) return;

    const ticket = tickets[0];

    // ── Conflict resolution: first-scan-wins ─────────────────────────────
    const existingLogs = await database
      .get<ScanLog>('scan_logs')
      .query(Q.where('ticket_id', data.ticketId))
      .fetch();

    if (existingLogs.length > 0) {
      const ourTime   = existingLogs[0].scanned_at;
      const theirTime = data.scannedAt;

      if (ourTime <= theirTime) {
        // We scanned first — our record wins, ignore peer
        console.log(`[Nearby] We scanned first (${ourTime} <= ${theirTime}), ignoring peer for: ${data.ticketId}`);
        return;
      }
      // They scanned first — their record wins, update ours
      console.log(`[Nearby] Peer scanned first (${theirTime} < ${ourTime}), updating: ${data.ticketId}`);
    }

    // Mark ticket as used
    if (ticket.status !== 'used') {
      await database.write(async () => {
        await ticket.update((t: Ticket) => {
          t.status = 'used';
        });
      });
      console.log(`[Nearby] ✅ Marked used from peer (${data.deviceName}): ${data.ticketId}`);
    }

    callbacks.onTicketScannedByPeer?.(data);
  } catch (e) {
    console.error('[Nearby] handleIncomingScan error:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
export async function connectToDevice(endpointId: string, deviceName: string): Promise<boolean> {
  return await nearbyConnect(endpointId, deviceName);
}

export function getDiscoveredDevices(): NearbyDevice[] {
  return [...discoveredPeers];
}

// FIX #12: Use cached local name instead of recomputing from AsyncStorage
export async function getConnectedDevices(): Promise<NearbyDevice[]> {
  const devices = await nearbyGetDevices();
  return devices.filter(d => d.deviceName !== localDeviceName);
}

export function getLocalDeviceName(): string {
  return localDeviceName;
}