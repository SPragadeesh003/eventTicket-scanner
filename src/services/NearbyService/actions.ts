import { Alert, Platform } from 'react-native';
import { getDeviceId } from '@/src/utils/DeviceID';
import { 
  isNearbyAvailable, 
  nearbyStart, 
  nearbyStartAdvertising, 
  nearbyStartDiscovery, 
  nearbyStop 
} from '@/src/native/NearbyConnections';
import { 
  clearAllAckTimeouts, 
  clearHeartbeat, 
  getActiveTransport,
  setForceReconnect,
  setReconnectInProgress,
  RECONNECT_JITTER_MS,
} from '@/src/services/MeshProtocols';
import { 
  isRunning, 
  setIsRunning, 
  localDeviceName, 
  setLocalDeviceName, 
  localDeviceId, 
  setLocalDeviceId, 
  handshakeCompletedFor, 
  callbacks, 
  setCallbacks,
  subscriptions,
  setSubscriptions,
  listenersAttached,
  setListenersAttached,
  forceReconnectInProgress,
  setForceReconnectInProgress,
  startInProgress,
  setStartInProgress,
  registerForceReconnect
} from './state';
import { checkNearbyPermissions, requestNearbyPermissions, checkWifiEnabled } from './permissions';
import { armDiscoveryWatchdog, clearDiscoveryWatchdog, checkForSilentReconnects } from './watchdog';
import { attachListeners } from './listeners';
import { getGateNumber } from './utils';

export function stopListening(): void {
  subscriptions.forEach(s => s.remove());
  setSubscriptions([]);
  setCallbacks({});
  setListenersAttached(false);
}

export async function stopNearbyService(): Promise<void> {
  clearDiscoveryWatchdog();
  clearHeartbeat();
  handshakeCompletedFor.clear();
  stopListening();
  setIsRunning(false);
  await nearbyStop();
}

export async function forceReconnect(): Promise<void> {
  if (forceReconnectInProgress) {
    console.warn('[Nearby] 🔄 Force reconnect already in progress — ignoring duplicate call');
    return;
  }
  setForceReconnectInProgress(true);
  setReconnectInProgress(true);

  const transport = getActiveTransport();
  console.warn(`[Nearby] 🔄 FORCE RECONNECT — tearing down stale ${transport} channel`);

  clearAllAckTimeouts();

  subscriptions.forEach(s => s.remove());
  setSubscriptions([]);
  setIsRunning(false);

  handshakeCompletedFor.clear();

  await nearbyStop();

  setListenersAttached(false);

  const basePauseMs = transport === 'ble' ? 800 : 500;
  const jitter = Math.floor(Math.random() * RECONNECT_JITTER_MS);
  const pauseMs = basePauseMs + jitter;
  console.warn(`[Nearby] ⏳ Waiting ${pauseMs}ms before restart...`);
  await new Promise(resolve => setTimeout(resolve, pauseMs));

  console.warn('[Nearby] 🔄 Restarting mesh after force reconnect...');
  try {
    await startNearbyService(callbacks);
  } finally {
    setForceReconnectInProgress(false);
    setReconnectInProgress(false);
  }
}

registerForceReconnect(forceReconnect);

export async function startNearbyService(cb: any = {}): Promise<void> {
  setCallbacks(cb);

  if (isRunning) {
    if (subscriptions.length === 0) attachListeners();
    return;
  }

  if (startInProgress) {
    console.warn('[Nearby] startNearbyService already in progress — ignoring concurrent call');
    return;
  }
  setStartInProgress(true);

  if (!isNearbyAvailable) {
    console.log('[Nearby] Module not available — mesh disabled');
    setIsRunning(true);
    setStartInProgress(false);
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
        cb.onPermissionDenied?.(denied);
        Alert.alert(
          'Permissions Required',
          `Multi-gate sync needs: ${shortNames}\n\nGo to Settings → Apps → ticket-scanner → Permissions and grant them.`,
          [{ text: 'OK' }]
        );
        setStartInProgress(false);
        return;
      }
    }
    console.log('[Nearby] ✅ All permissions granted');
  }

  const deviceId = await getDeviceId();
  setLocalDeviceId(deviceId);
  const gateNumber = await getGateNumber();
  const name = `Gate-${gateNumber}-${deviceId.slice(-4).toUpperCase()}`;
  setLocalDeviceName(name);

  setForceReconnect(forceReconnect);

  attachListeners();

  const started = await nearbyStart(name);
  if (!started) {
    console.error('[Nearby] nearbyStart() failed — aborting');
    subscriptions.forEach(s => s.remove());
    setSubscriptions([]);
    setStartInProgress(false);
    return;
  }

  await Promise.all([
    nearbyStartAdvertising(name),
    nearbyStartDiscovery(),
  ]);

  setIsRunning(true);
  setStartInProgress(false);
  console.log(`[Nearby] ✅ Mesh started as: ${name}`);

  armDiscoveryWatchdog();


  setTimeout(() => { checkForSilentReconnects(); }, 800); 
}