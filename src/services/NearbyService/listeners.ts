import { Alert } from 'react-native';
import { NearbyEmitter, NEARBY_EVENTS, nearbyConnect } from '@/src/native/NearbyConnections';
import { NearbyDevice } from '@/src/types/Nearby.types';
import { receiveMessage, onPeerConnected } from '@/src/services/MeshProtocols';
import { 
  listenersAttached, 
  setListenersAttached, 
  subscriptions, 
  setSubscriptions,
  localDeviceName,
  localDeviceId,
  handshakeCompletedFor,
  discoveredPeers,
  setDiscoveredPeers,
  callbacks,
  isRunning,
  _registry
} from './state';
import { clearDiscoveryWatchdog, armDiscoveryWatchdog } from './watchdog';

export function attachListeners(): void {
  if (!NearbyEmitter) return;

  if (listenersAttached) {
    console.log('[Nearby] Listeners already attached — skipping re-attach');
    return;
  }
  setListenersAttached(true);

  subscriptions.forEach(s => s.remove());
  const newSubscriptions = [];

  const recentPayloads = new Map<string, number>(); 
  const PAYLOAD_DEDUP_MS = 500; 

  newSubscriptions.push(
    NearbyEmitter.addListener(
      NEARBY_EVENTS.PAYLOAD,
      async (event: { endpointId: string; payload: string }) => {
        const key = event.payload.slice(0, 80);
        const now = Date.now();
        const lastSeen = recentPayloads.get(key);
        if (lastSeen && now - lastSeen < PAYLOAD_DEDUP_MS) {
          console.log(`[Nearby] 🔁 Raw payload dedup — dropped duplicate within ${PAYLOAD_DEDUP_MS}ms`);
          return;
        }
        recentPayloads.set(key, now);
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

  newSubscriptions.push(
    NearbyEmitter.addListener(NEARBY_EVENTS.CONNECTED, (device: NearbyDevice) => {
      if (device.deviceName === localDeviceName) {
        console.log('[Nearby] Self-connection ignored:', device.deviceName);
        return;
      }

      if (handshakeCompletedFor.has(device.deviceName)) {
        console.log(`[Nearby] Handshake already done for ${device.deviceName} — skipping duplicate`);
        return;
      }
      handshakeCompletedFor.add(device.deviceName);

      console.log('[Nearby] ✅ Connected:', device.deviceName);
      clearDiscoveryWatchdog();

      setDiscoveredPeers(discoveredPeers.filter(p => p.endpointId !== device.endpointId));
      callbacks.onDeviceConnected?.(device);
      onPeerConnected(localDeviceId, device.deviceName).catch(e =>
        console.error('[Nearby] onPeerConnected error:', e)
      );
    })
  );

  newSubscriptions.push(
    NearbyEmitter.addListener(NEARBY_EVENTS.DEVICE_FOUND, async (device: NearbyDevice) => {
      if (device.deviceName === localDeviceName) return;
      if (!discoveredPeers.find(p => p.endpointId === device.endpointId)) {
        setDiscoveredPeers([...discoveredPeers, device]);
      }
      console.log('[Nearby] Found nearby:', device.deviceName);
      callbacks.onDeviceFound?.(device);

      if (!handshakeCompletedFor.has(device.deviceName)) {
        try {
          console.log('[Nearby] Found unconnected peer — connecting immediately:', device.deviceName);
          await nearbyConnect(device.endpointId, device.deviceName);
        } catch (e: any) {
          console.warn('[Nearby] Immediate connect failed for', device.deviceName, ':', e?.message ?? e);
        }
      }
    })
  );

  const recentlyDisconnected = new Set<string>();

  newSubscriptions.push(
    NearbyEmitter.addListener(NEARBY_EVENTS.DISCONNECTED, (device: NearbyDevice) => {
      if (recentlyDisconnected.has(device.endpointId)) return;
      recentlyDisconnected.add(device.endpointId);
      setTimeout(() => recentlyDisconnected.delete(device.endpointId), 2000);

      console.log('[Nearby] ❌ Disconnected:', device.deviceName);
      setDiscoveredPeers(discoveredPeers.filter(p => p.endpointId !== device.endpointId));

      handshakeCompletedFor.delete(device.deviceName);

      callbacks.onDeviceDisconnected?.(device);

      if (isRunning) {
        console.log('[Nearby] 🐕 Peer disconnected — arming discovery watchdog');
        armDiscoveryWatchdog();
      }
    })
  );

  newSubscriptions.push(
    NearbyEmitter.addListener(NEARBY_EVENTS.DEBUG, (event: { message: string }) => {
      console.log('[Nearby DEBUG]', event.message);
    })
  );

  newSubscriptions.push(
    NearbyEmitter.addListener(
      NEARBY_EVENTS.RECONNECT,
      (event: { endpointId: string; attempt: number }) => {
        console.log(`[Nearby] Reconnecting to ${event.endpointId} attempt ${event.attempt}`);
      }
    )
  );

  newSubscriptions.push(
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

  newSubscriptions.push(
    NearbyEmitter.addListener(
      'NearbyPayloadFailed',
      async (event: { endpointId: string; deviceName: string; failCount: number }) => {
        console.warn(`[Nearby] ⚡ PAYLOAD_FAILED on ${event.deviceName} (${event.failCount} fails) — immediate force reconnect`);
        try {
          await _registry.forceReconnect?.();
        } catch (e) {
          console.error('[Nearby] forceReconnect from PAYLOAD_FAILED threw:', e);
        }
      }
    )
  );

  setSubscriptions(newSubscriptions);
}