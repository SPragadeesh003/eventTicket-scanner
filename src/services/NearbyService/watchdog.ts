import {
  nearbyGetDevices,
  nearbyStartAdvertising,
  nearbyStartDiscovery,
  nearbyConnect,
} from '@/src/native/NearbyConnections';
import { onPeerConnected } from '@/src/services/MeshProtocols';
import { DISCOVERY_WATCHDOG_MS } from './constants';
import {
  isRunning,
  localDeviceName,
  localDeviceId,
  handshakeCompletedFor,
  callbacks,
  discoveredPeers,
  setDiscoveredPeers,
} from './state';

let discoveryWatchdogTimer: ReturnType<typeof setTimeout> | null = null;

const connectingViaWatchdog = new Set<string>();

export function clearDiscoveryWatchdog(): void {
  if (discoveryWatchdogTimer !== null) {
    clearTimeout(discoveryWatchdogTimer);
    discoveryWatchdogTimer = null;
  }
}

export function armDiscoveryWatchdog(): void {
  clearDiscoveryWatchdog();
  discoveryWatchdogTimer = setTimeout(async () => {
    discoveryWatchdogTimer = null;
    if (!isRunning) return;
    let connectedDevices: Awaited<ReturnType<typeof nearbyGetDevices>> = [];
    try {
      connectedDevices = await nearbyGetDevices();
    } catch (_) { }

    const reallyConnected = connectedDevices.filter(d => d.deviceName !== localDeviceName);

    if (reallyConnected.length > 0) {
      const unhandled = reallyConnected.filter(d => !handshakeCompletedFor.has(d.deviceName));

      if (unhandled.length > 0) {
        console.warn(`[Nearby] 🐕 Watchdog — ${unhandled.length} Java-connected peer(s) missing JS handshake — recovering`);
        for (const device of unhandled) {
          console.warn(`[Nearby] 🐕 Watchdog recovering: ${device.deviceName} (${device.endpointId})`);
          handshakeCompletedFor.add(device.deviceName);
          setDiscoveredPeers(discoveredPeers.filter(p => p.endpointId !== device.endpointId));
          connectingViaWatchdog.delete(device.endpointId);
          callbacks.onDeviceConnected?.(device);
          try {
            await onPeerConnected(localDeviceId, device.deviceName);
          } catch (e) {
            console.error('[Nearby] 🐕 Watchdog onPeerConnected error:', e);
          }
        }
        armDiscoveryWatchdog();
        return;
      }

      console.log('[Nearby] 🐕 Watchdog fired — peers connected and handshaked — no nudge needed');
      const connectedEndpointIds = new Set(reallyConnected.map(d => d.endpointId));
      setDiscoveredPeers(discoveredPeers.filter(p => !connectedEndpointIds.has(p.endpointId)));
      connectingViaWatchdog.clear();
      return;
    }
    const unconnected = discoveredPeers.filter(
      d =>
        d.deviceName !== localDeviceName &&
        !handshakeCompletedFor.has(d.deviceName) &&
        !connectingViaWatchdog.has(d.endpointId)
    );

    if (unconnected.length > 0) {
      console.warn(`[Nearby] 🐕 Watchdog — ${unconnected.length} discovered-but-unconnected peer(s), connecting directly`);

      for (const device of unconnected) {
        console.log(`[Nearby] 🐕 Watchdog connecting to: ${device.deviceName} (${device.endpointId})`);
        connectingViaWatchdog.add(device.endpointId);

        try {
          await nearbyConnect(device.endpointId, device.deviceName);
          armDiscoveryWatchdog();
          return;
        } catch (e: any) {
          console.warn(`[Nearby] 🐕 Direct connect failed for ${device.deviceName}: ${e?.message ?? e}`);
          connectingViaWatchdog.delete(device.endpointId);
          setDiscoveredPeers(discoveredPeers.filter(p => p.endpointId !== device.endpointId));
        }
      }
    }
    console.warn('[Nearby] 🐕 Discovery watchdog fired — no peers in '
      + (DISCOVERY_WATCHDOG_MS / 1000) + 's, nudging advertising+discovery');

    connectingViaWatchdog.clear();

    try {
      await Promise.all([
        nearbyStartAdvertising(localDeviceName),
        nearbyStartDiscovery(),
      ]);
      console.log('[Nearby] 🐕 Watchdog nudge sent — re-advertising and re-discovering');
    } catch (e) {
      console.error('[Nearby] 🐕 Watchdog nudge failed:', e);
    }

    armDiscoveryWatchdog();

  }, DISCOVERY_WATCHDOG_MS);
}

export async function checkForSilentReconnects(): Promise<void> {
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
      setDiscoveredPeers(discoveredPeers.filter(p => p.endpointId !== device.endpointId));
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