/**
 * NearbyConnectionServices.ts
 *
 * Key fix in this version:
 *
 * SILENT RECONNECT after forceReconnect:
 *   When nearbyStop() + nearbyStart() runs, the other device's connection
 *   sometimes survives at the Nearby layer (especially on WiFi Direct where
 *   the P2P group persists). In this case, Nearby reconnects silently —
 *   no onConnectionInitiated → no onConnectionResult → no NearbyConnected
 *   event. So onPeerConnected() never fires, and flushOutbox() is never
 *   called. The outbox sits with delivered=false forever.
 *
 *   Fix: after startNearbyService() completes, wait 1500ms for the normal
 *   NearbyConnected event. If it fires, handshakeCompletedFor already
 *   contains that peer and we skip it. If it didn't fire (silent reconnect),
 *   checkForSilentReconnects() calls onPeerConnected() manually to trigger
 *   the CATCHUP + flushOutbox(true) + PING handshake.
 *
 * PONG-triggered flush (MeshProtocol.ts):
 *   PONG proves the channel is live end-to-end. If outbox entries are still
 *   undelivered when PONG arrives, flush immediately with bypassCooldown=true.
 */

import {
  Alert,
  EmitterSubscription,
  Platform,
  PermissionsAndroid,
  type Permission,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDeviceId } from '@/src/utils/DeviceID';
import {
  nearbyStart,
  nearbyStop,
  nearbyGetDevices,
  nearbyConnect,
  nearbyStartAdvertising,
  nearbyStartDiscovery,
  NearbyEmitter,
  NEARBY_EVENTS,
  isNearbyAvailable,
  type NearbyDevice,
} from '@/src/native/NearbyConnections';
import {
  receiveMessage,
  onPeerConnected,
  setProtocolCallbacks,
  setForceReconnect,
  clearAllAckTimeouts,
  clearHeartbeat,
  getActiveTransport,
  type ScanPayload,
} from '@/src/services/MeshProtocol';

// ─── Storage key ──────────────────────────────────────────────────────────────
const GATE_NUMBER_KEY = '@gate_number';

export type { ScanPayload };

// ─── Callbacks ────────────────────────────────────────────────────────────────
export interface NearbyCallbacks {
  onTicketScannedByPeer?: (payload: ScanPayload) => void;
  onDeviceConnected?:    (device: NearbyDevice)  => void;
  onDeviceDisconnected?: (device: NearbyDevice)  => void;
  onDeviceFound?:        (device: NearbyDevice)  => void;
  onPermissionDenied?:   (missing: string[])     => void;
  onTransportDetected?:  (isBLE: boolean, rttMs: number) => void;
}

// ─── Service state ────────────────────────────────────────────────────────────
let subscriptions:   EmitterSubscription[] = [];
let callbacks:       NearbyCallbacks = {};
let isRunning        = false;
let localDeviceName  = '';
let localDeviceId    = '';
let discoveredPeers: NearbyDevice[] = [];
let listenersAttached = false; // listeners are attached once and never re-added

// Tracks which peer deviceNames have had onPeerConnected called this session.
// Prevents double-handshake if both the NearbyConnected event AND the silent
// reconnect check find the same peer.
const handshakeCompletedFor = new Set<string>();

// ─── Discovery watchdog ───────────────────────────────────────────────────────
const DISCOVERY_WATCHDOG_MS = 10_000;
let discoveryWatchdogTimer: ReturnType<typeof setTimeout> | null = null;

function armDiscoveryWatchdog(): void {
  clearDiscoveryWatchdog();
  discoveryWatchdogTimer = setTimeout(async () => {
    discoveryWatchdogTimer = null;
    if (!isRunning) return;

    let peerCount = 0;
    try {
      const devices = await nearbyGetDevices();
      peerCount = devices.length;
    } catch (_) {}

    if (peerCount > 0) {
      console.log('[Nearby] 🐕 Watchdog fired but peers found — no nudge needed');
      return;
    }

    console.warn('[Nearby] 🐕 Discovery watchdog fired — no peers in '
      + (DISCOVERY_WATCHDOG_MS / 1000) + 's, nudging advertising+discovery');

    try {
      await nearbyStartAdvertising(localDeviceName);
      await nearbyStartDiscovery();
      console.log('[Nearby] 🐕 Watchdog nudge sent — re-advertising and re-discovering');
      armDiscoveryWatchdog();
    } catch (e) {
      console.error('[Nearby] 🐕 Watchdog nudge failed:', e);
    }
  }, DISCOVERY_WATCHDOG_MS);
}

function clearDiscoveryWatchdog(): void {
  if (discoveryWatchdogTimer !== null) {
    clearTimeout(discoveryWatchdogTimer);
    discoveryWatchdogTimer = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SILENT RECONNECT CHECK
//
//  Called 1500ms after startNearbyService. Looks for peers that are already
//  connected at the Nearby layer but never fired a NearbyConnected event
//  (because the WiFi Direct P2P group survived the stop/start cycle).
//
//  If found, manually triggers the full CATCHUP + flushOutbox(true) + PING
//  handshake so the outbox is flushed and the stale channel is confirmed live.
// ─────────────────────────────────────────────────────────────────────────────
async function checkForSilentReconnects(): Promise<void> {
  if (!isRunning) return;

  try {
    const devices = await nearbyGetDevices();
    const unhandled = devices.filter(
      d => d.deviceName !== localDeviceName && !handshakeCompletedFor.has(d.deviceName)
    );

    if (unhandled.length === 0) {
      console.log('[Nearby] 🔇 Silent reconnect check — no unhandled peers');
      return;
    }

    console.warn(`[Nearby] 🔇 Silent reconnect — ${unhandled.length} peer(s) connected without handshake:`);
    for (const device of unhandled) {
      console.warn(`[Nearby] 🔇   → ${device.deviceName} (${device.endpointId}) — triggering manual handshake`);
      handshakeCompletedFor.add(device.deviceName);
      clearDiscoveryWatchdog();
      callbacks.onDeviceConnected?.(device);
      try {
        await onPeerConnected(localDeviceId, device.deviceName);
      } catch (e) {
        console.error('[Nearby] Silent reconnect onPeerConnected error:', e);
      }
    }
  } catch (e) {
    console.error('[Nearby] checkForSilentReconnects error:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  WIFI PREFLIGHT CHECK
// ─────────────────────────────────────────────────────────────────────────────
async function checkWifiEnabled(): Promise<void> {
  try {
    const NetInfo = require('@react-native-community/netinfo').default;
    const state   = await NetInfo.fetch('wifi');
    const wifiEnabled = state.isWifiEnabled ?? true;

    if (!wifiEnabled) {
      console.warn('[Nearby] ⚠️ WiFi radio is OFF — Nearby will fall back to BLE only');
      Alert.alert(
        '⚠️ Turn On WiFi for Best Performance',
        'WiFi is currently off. Turn it ON (you don\'t need to connect to any network).\n\nThis enables WiFi Direct — much faster peer-to-peer sync between gates.',
        [{ text: 'Got it' }]
      );
    } else {
      console.log('[Nearby] ✅ WiFi radio is ON — WiFi Direct transport available');
    }
  } catch (e) {
    console.log('[Nearby] NetInfo not available — skipping WiFi preflight check');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  PERMISSIONS
// ─────────────────────────────────────────────────────────────────────────────
function getNearbyPermissions(): Permission[] {
  const api = parseInt(String(Platform.Version), 10);
  const perms: Permission[] = [];

  if (api >= 31) {
    perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
    perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE);
    perms.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  }

  if (api >= 32) {
    perms.push('android.permission.NEARBY_WIFI_DEVICES' as Permission);
  }

  if (api <= 31) {
    perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  }

  return perms;
}

async function checkNearbyPermissions(): Promise<string[]> {
  const denied: string[] = [];
  for (const perm of getNearbyPermissions()) {
    if (!(await PermissionsAndroid.check(perm))) denied.push(perm);
  }
  return denied;
}

async function requestNearbyPermissions(): Promise<string[]> {
  const perms = getNearbyPermissions();
  if (perms.length === 0) return [];
  const results = await PermissionsAndroid.requestMultiple(perms);
  return Object.entries(results)
    .filter(([, status]) => status !== PermissionsAndroid.RESULTS.GRANTED)
    .map(([perm]) => perm);
}

// ─────────────────────────────────────────────────────────────────────────────
//  GATE NUMBER
// ─────────────────────────────────────────────────────────────────────────────
export async function setGateNumber(number: number): Promise<void> {
  await AsyncStorage.setItem(GATE_NUMBER_KEY, String(number));
}

export async function getGateNumber(): Promise<number> {
  const stored = await AsyncStorage.getItem(GATE_NUMBER_KEY);
  return stored ? parseInt(stored, 10) : 1;
}

// ─────────────────────────────────────────────────────────────────────────────
//  FORCE RECONNECT
// ─────────────────────────────────────────────────────────────────────────────
let forceReconnectInProgress = false;
let startInProgress          = false;  // prevents concurrent startNearbyService calls

async function forceReconnect(): Promise<void> {
  // Guard: ignore concurrent calls (NearbyPayloadFailed can fire multiple
  // times in quick succession from doubled listeners — only one reconnect needed)
  if (forceReconnectInProgress) {
    console.warn('[Nearby] 🔄 Force reconnect already in progress — ignoring duplicate call');
    return;
  }
  forceReconnectInProgress = true;

  const transport = getActiveTransport();
  console.warn(`[Nearby] 🔄 FORCE RECONNECT — tearing down stale ${transport} channel`);

  clearAllAckTimeouts();

  // Remove ALL subscriptions before stopping — prevents doubled event handlers
  // from firing during the teardown/restart cycle
  subscriptions.forEach(s => s.remove());
  subscriptions = [];
  isRunning = false;

  // Clear handshake tracking — new session, fresh slate
  handshakeCompletedFor.clear();

  await nearbyStop();

  const pauseMs = transport === 'ble' ? 1500 : 1000;
  console.warn(`[Nearby] ⏳ Waiting ${pauseMs}ms before restart...`);
  await new Promise(resolve => setTimeout(resolve, pauseMs));

  console.warn('[Nearby] 🔄 Restarting mesh after force reconnect...');
  // Keep forceReconnectInProgress=true through startNearbyService so any
  // late-firing heartbeat timeouts (from orphaned timers) that call
  // forceReconnect again during the restart are dropped.
  try {
    await startNearbyService(callbacks);
  } finally {
    forceReconnectInProgress = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────────────────────────────────────
export async function startNearbyService(cb: NearbyCallbacks = {}): Promise<void> {
  callbacks = cb;

  if (isRunning) {
    if (subscriptions.length === 0) attachListeners();
    return;
  }

  // Prevent concurrent starts (e.g. AppState foreground + forceReconnect racing)
  if (startInProgress) {
    console.warn('[Nearby] startNearbyService already in progress — ignoring concurrent call');
    return;
  }
  startInProgress = true;

  if (!isNearbyAvailable) {
    console.log('[Nearby] Module not available — mesh disabled');
    isRunning = true;
    return;
  }

  if (Platform.OS === 'android') {
    await checkWifiEnabled();
  }

  if (Platform.OS === 'android') {
    let denied = await checkNearbyPermissions();
    if (denied.length > 0) {
      console.log('[Nearby] Missing permissions, requesting:', denied);
      denied = await requestNearbyPermissions();
      if (denied.length > 0) {
        const shortNames = denied.map(p => p.split('.').pop()).join(', ');
        console.error('[Nearby] Permissions denied:', denied);
        callbacks.onPermissionDenied?.(denied);
        Alert.alert(
          'Permissions Required',
          `Multi-gate sync needs: ${shortNames}\n\nGo to Settings → Apps → ticket-scanner → Permissions and grant them.`,
          [{ text: 'OK' }]
        );
        startInProgress = false;
        return;
      }
    }
    console.log('[Nearby] ✅ All permissions granted');
  }

  localDeviceId    = await getDeviceId();
  const gateNumber = await getGateNumber();
  localDeviceName  = `Gate-${gateNumber}-${localDeviceId.slice(-4).toUpperCase()}`;

  setForceReconnect(forceReconnect);

  setProtocolCallbacks({
    onTicketSyncedFromPeer: (payload) => callbacks.onTicketScannedByPeer?.(payload),
    onPeerRTT:              (_deviceId, _rttMs) => {},
    onAckReceived:          (_ticketId, _fromDeviceId) => {},
    onTransportDetected:    (isBLE, rttMs) => callbacks.onTransportDetected?.(isBLE, rttMs),
  });

  attachListeners();

  const started = await nearbyStart(localDeviceName);
  if (!started) {
    console.error('[Nearby] nearbyStart() failed — aborting');
    subscriptions.forEach(s => s.remove());
    subscriptions = [];
    startInProgress = false;
    return;
  }

  await nearbyStartAdvertising(localDeviceName);
  await nearbyStartDiscovery();

  isRunning       = true;
  startInProgress = false;  // cleared here; forceReconnectInProgress cleared in forceReconnect's finally
  console.log(`[Nearby] ✅ Mesh started as: ${localDeviceName}`);

  // Arm discovery watchdog
  armDiscoveryWatchdog();

  // Check for silent reconnects after 1500ms.
  // Normal NearbyConnected event has time to fire first.
  // If it fired → handshakeCompletedFor has the peer → we skip.
  // If it didn't fire (silent reconnect) → we trigger handshake manually.
  setTimeout(() => { checkForSilentReconnects(); }, 1500);
}

// ─────────────────────────────────────────────────────────────────────────────
//  LISTENERS
// ─────────────────────────────────────────────────────────────────────────────
function attachListeners(): void {
  if (!NearbyEmitter) return;

  // SINGLETON GUARD: listeners are attached exactly once per app lifecycle.
  // Re-attaching on every reconnect is what causes the 4x event storm —
  // each forceReconnect → startNearbyService → attachListeners cycle adds
  // another full set of listeners even if old ones weren't fully removed.
  // Instead: attach once, keep forever, route through mutable `callbacks` ref.
  if (listenersAttached) {
    console.log('[Nearby] Listeners already attached — skipping re-attach');
    return;
  }
  listenersAttached = true;

  subscriptions.forEach(s => s.remove());
  subscriptions = [];

  // ── PAYLOAD ────────────────────────────────────────────────────────────────
  // Pre-dedup at the listener level: if the same raw payload string arrives
  // twice (from doubled native events or two active endpointIds for the same
  // peer during a P2P group re-form), drop the second immediately.
  // This catches cases where msgId-level dedup in receiveMessage is too late
  // (e.g. if the peer has doubled subscriptions and sends the same message twice
  // with slightly different timestamps, producing different msgIds).
  const recentPayloads = new Map<string, number>(); // payload hash → receivedAt
  const PAYLOAD_DEDUP_MS = 500; // 500ms window — same payload twice = duplicate

  subscriptions.push(
    NearbyEmitter.addListener(
      NEARBY_EVENTS.PAYLOAD,
      async (event: { endpointId: string; payload: string }) => {
        // Fast dedup: use first 80 chars as key (contains type + deviceId + msgId)
        const key = event.payload.slice(0, 80);
        const now = Date.now();
        const lastSeen = recentPayloads.get(key);
        if (lastSeen && now - lastSeen < PAYLOAD_DEDUP_MS) {
          console.log(`[Nearby] 🔁 Raw payload dedup — dropped duplicate within ${PAYLOAD_DEDUP_MS}ms`);
          return;
        }
        recentPayloads.set(key, now);
        // Evict old entries
        for (const [k, ts] of recentPayloads) {
          if (now - ts > PAYLOAD_DEDUP_MS * 4) recentPayloads.delete(k);
        }

        try {
          await receiveMessage(event.payload, event.endpointId, localDeviceId);
        } catch (e) {
          console.error('[Nearby] receiveMessage threw:', e);
        }
      }
    )
  );

  // ── CONNECTED ──────────────────────────────────────────────────────────────
  subscriptions.push(
    NearbyEmitter.addListener(NEARBY_EVENTS.CONNECTED, (device: NearbyDevice) => {
      if (device.deviceName === localDeviceName) {
        console.log('[Nearby] Self-connection ignored:', device.deviceName);
        return;
      }

      // Guard: don't double-handshake — catches both doubled Nearby events
      // AND the case where silent reconnect check already ran for this peer.
      if (handshakeCompletedFor.has(device.deviceName)) {
        console.log(`[Nearby] Handshake already done for ${device.deviceName} — skipping duplicate`);
        return;
      }
      handshakeCompletedFor.add(device.deviceName);

      console.log('[Nearby] ✅ Connected:', device.deviceName);
      clearDiscoveryWatchdog();

      discoveredPeers = discoveredPeers.filter(p => p.endpointId !== device.endpointId);
      callbacks.onDeviceConnected?.(device);
      onPeerConnected(localDeviceId, device.deviceName).catch(e =>
        console.error('[Nearby] onPeerConnected error:', e)
      );
    })
  );

  // ── DEVICE_FOUND ───────────────────────────────────────────────────────────
  subscriptions.push(
    NearbyEmitter.addListener(NEARBY_EVENTS.DEVICE_FOUND, (device: NearbyDevice) => {
      if (device.deviceName === localDeviceName) return;
      if (!discoveredPeers.find(p => p.endpointId === device.endpointId)) {
        discoveredPeers.push(device);
      }
      console.log('[Nearby] Found nearby:', device.deviceName);
      callbacks.onDeviceFound?.(device);
    })
  );

  // ── DISCONNECTED ───────────────────────────────────────────────────────────
  // Track recently disconnected endpoints to suppress doubled DISCONNECTED
  // events that come from doubled listener subscriptions.
  const recentlyDisconnected = new Set<string>();

  subscriptions.push(
    NearbyEmitter.addListener(NEARBY_EVENTS.DISCONNECTED, (device: NearbyDevice) => {
      if (recentlyDisconnected.has(device.endpointId)) return;
      recentlyDisconnected.add(device.endpointId);
      setTimeout(() => recentlyDisconnected.delete(device.endpointId), 2000);

      console.log('[Nearby] ❌ Disconnected:', device.deviceName);
      discoveredPeers = discoveredPeers.filter(p => p.endpointId !== device.endpointId);

      // Clear handshake record so next reconnect gets a fresh handshake
      handshakeCompletedFor.delete(device.deviceName);

      callbacks.onDeviceDisconnected?.(device);

      if (isRunning) {
        console.log('[Nearby] 🐕 Peer disconnected — arming discovery watchdog');
        armDiscoveryWatchdog();
      }
    })
  );

  // ── DEBUG ──────────────────────────────────────────────────────────────────
  subscriptions.push(
    NearbyEmitter.addListener(NEARBY_EVENTS.DEBUG, (event: { message: string }) => {
      console.log('[Nearby DEBUG]', event.message);
    })
  );

  // ── RECONNECT ──────────────────────────────────────────────────────────────
  subscriptions.push(
    NearbyEmitter.addListener(
      NEARBY_EVENTS.RECONNECT,
      (event: { endpointId: string; attempt: number }) => {
        console.log(`[Nearby] Reconnecting to ${event.endpointId} attempt ${event.attempt}`);
      }
    )
  );

  // ── PERMISSION ─────────────────────────────────────────────────────────────
  subscriptions.push(
    NearbyEmitter.addListener(
      NEARBY_EVENTS.PERMISSION,
      (event: { missing: string }) => {
        console.error('[Nearby] Runtime permission revoked:', event.missing);
        Alert.alert(
          'Permission Revoked',
          `Nearby permissions were revoked mid-session.\n\n${event.missing}\n\nPlease grant them in Settings.`,
          [{ text: 'OK' }]
        );
      }
    )
  );

  // ── PAYLOAD_FAILED ─────────────────────────────────────────────────────────
  // forceReconnect() has its own guard (forceReconnectInProgress) so even if
  // this fires multiple times (doubled subscriptions, rapid failures), only
  // one reconnect executes.
  subscriptions.push(
    NearbyEmitter.addListener(
      'NearbyPayloadFailed',
      async (event: { endpointId: string; deviceName: string; failCount: number }) => {
        console.warn(`[Nearby] ⚡ PAYLOAD_FAILED on ${event.deviceName} (${event.failCount} fails) — immediate force reconnect`);
        try {
          await forceReconnect();
        } catch (e) {
          console.error('[Nearby] forceReconnect from PAYLOAD_FAILED threw:', e);
        }
      }
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  STOP
// ─────────────────────────────────────────────────────────────────────────────
export function stopListening(): void {
  subscriptions.forEach(s => s.remove());
  subscriptions    = [];
  callbacks        = {};
  listenersAttached = false; // allow re-attach on next startNearbyService
}

export async function stopNearbyService(): Promise<void> {
  clearDiscoveryWatchdog();
  clearHeartbeat();
  handshakeCompletedFor.clear();
  stopListening();
  isRunning = false;
  discoveredPeers = [];
  await nearbyStop();
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

export async function getConnectedDevices(): Promise<NearbyDevice[]> {
  const devices = await nearbyGetDevices();
  return devices.filter(d => d.deviceName !== localDeviceName);
}

export function getLocalDeviceName(): string {
  return localDeviceName;
}

export function isServiceRunning(): boolean {
  return isRunning;
}