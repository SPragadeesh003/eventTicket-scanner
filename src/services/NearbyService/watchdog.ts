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

// Tracks endpointIds that are currently mid-connection attempt
const connectingViaWatchdog = new Set<string>();

// Tracks endpointIds that have failed to connect at least once — stale candidates
const failedEndpointIds = new Set<string>();

// Tracks when each endpointId was first seen — evict if too old
const endpointFirstSeen = new Map<string, number>();
const ENDPOINT_MAX_AGE_MS = 30_000; // evict stale endpoints after 30s

export function clearDiscoveryWatchdog(): void {
  if (discoveryWatchdogTimer !== null) {
    clearTimeout(discoveryWatchdogTimer);
    discoveryWatchdogTimer = null;
  }
}

/**
 * Called when a new peer is discovered — records when we first saw it.
 * Call this from the DEVICE_FOUND listener.
 */
export function onEndpointDiscovered(endpointId: string): void {
  if (!endpointFirstSeen.has(endpointId)) {
    endpointFirstSeen.set(endpointId, Date.now());
  }
}

/**
 * Called when a peer connects successfully — clean up all tracking state for it.
 */
export function onEndpointConnected(endpointId: string): void {
  connectingViaWatchdog.delete(endpointId);
  failedEndpointIds.delete(endpointId);
  endpointFirstSeen.delete(endpointId);
}

/**
 * Evict stale endpoints: those that have been in discoveredPeers too long without
 * connecting, or those that have failed a connection attempt.
 */
function evictStaleEndpoints(): void {
  const now = Date.now();
  const stale = new Set<string>();

  // Failed endpoints are immediately stale
  for (const id of failedEndpointIds) {
    stale.add(id);
  }

  // Endpoints older than max age are stale
  for (const [id, seenAt] of endpointFirstSeen) {
    if (now - seenAt > ENDPOINT_MAX_AGE_MS) {
      stale.add(id);
    }
  }

  if (stale.size === 0) return;

  const before = discoveredPeers.length;
  setDiscoveredPeers(discoveredPeers.filter(p => !stale.has(p.endpointId)));
  const after = discoveredPeers.length;

  if (before !== after) {
    console.log(`[Nearby] 🗑️ Evicted ${before - after} stale endpoint(s) from discoveredPeers`);
  }

  for (const id of stale) {
    connectingViaWatchdog.delete(id);
    failedEndpointIds.delete(id);
    endpointFirstSeen.delete(id);
  }
}

export function armDiscoveryWatchdog(): void {
  clearDiscoveryWatchdog();
  discoveryWatchdogTimer = setTimeout(async () => {
    discoveryWatchdogTimer = null;
    if (!isRunning) return;

    // Step 1: evict stale endpoints before any decision
    evictStaleEndpoints();

    let connectedDevices: Awaited<ReturnType<typeof nearbyGetDevices>> = [];
    try {
      connectedDevices = await nearbyGetDevices();
    } catch (_) {}

    const reallyConnected = connectedDevices.filter(d => d.deviceName !== localDeviceName);

    // Step 2: recover any Java-connected peers that missed the JS handshake
    if (reallyConnected.length > 0) {
      const unhandled = reallyConnected.filter(d => !handshakeCompletedFor.has(d.deviceName));

      if (unhandled.length > 0) {
        console.warn(
          `[Nearby] 🐕 Watchdog — ${unhandled.length} Java-connected peer(s) missing JS handshake — recovering`
        );
        for (const device of unhandled) {
          console.warn(`[Nearby] 🐕 Watchdog recovering: ${device.deviceName} (${device.endpointId})`);
          handshakeCompletedFor.add(device.deviceName);
          setDiscoveredPeers(discoveredPeers.filter(p => p.endpointId !== device.endpointId));
          onEndpointConnected(device.endpointId);
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

    // Step 3: attempt to connect to all unconnected discovered peers simultaneously
    // (not one-at-a-time — that was the key bug causing 6-minute stalls with 3+ devices)
    const unconnected = discoveredPeers.filter(
      d =>
        d.deviceName !== localDeviceName &&
        !handshakeCompletedFor.has(d.deviceName) &&
        !connectingViaWatchdog.has(d.endpointId) &&
        !failedEndpointIds.has(d.endpointId)
    );

    if (unconnected.length > 0) {
      console.warn(
        `[Nearby] 🐕 Watchdog — ${unconnected.length} discovered-but-unconnected peer(s), connecting`
      );

      // Connect to all peers in parallel, not sequentially
      // For 5-6 devices this means all connections fire at once instead of one every 5s
      const connectPromises = unconnected.map(async (device) => {
        console.log(`[Nearby] 🐕 Watchdog connecting to: ${device.deviceName} (${device.endpointId})`);
        connectingViaWatchdog.add(device.endpointId);

        try {
          const ok = await nearbyConnect(device.endpointId, device.deviceName);
          if (!ok) {
            // nearbyConnect returned false — endpointId is dead
            console.warn(
              `[Nearby] 🐕 Connect returned false for ${device.deviceName} (${device.endpointId}) — marking stale`
            );
            failedEndpointIds.add(device.endpointId);
            connectingViaWatchdog.delete(device.endpointId);
          }
          // If ok=true, connection is in progress — CONNECTED event will fire
          // connectingViaWatchdog entry stays until onEndpointConnected clears it
        } catch (e: any) {
          console.warn(
            `[Nearby] 🐕 Direct connect failed for ${device.deviceName} (${device.endpointId}): ${e?.message ?? e} — marking stale`
          );
          failedEndpointIds.add(device.endpointId);
          connectingViaWatchdog.delete(device.endpointId);
        }
      });

      // Fire all connection attempts simultaneously, don't await sequentially
      // Use allSettled so one failure doesn't block the others
      await Promise.allSettled(connectPromises);

      // Re-arm watchdog to check if connections succeeded
      armDiscoveryWatchdog();
      return;
    }

    // Step 4: no discovered peers at all — nudge advertising+discovery
    console.warn(
      '[Nearby] 🐕 Discovery watchdog fired — no peers in ' +
        DISCOVERY_WATCHDOG_MS / 1000 +
        's, nudging advertising+discovery'
    );

    connectingViaWatchdog.clear();
    failedEndpointIds.clear();

    try {
      await Promise.all([nearbyStartAdvertising(localDeviceName), nearbyStartDiscovery()]);
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
      console.warn(
        `[Nearby] 🔇   → ${device.deviceName} (${device.endpointId}) — triggering manual handshake`
      );
      handshakeCompletedFor.add(device.deviceName);
      clearDiscoveryWatchdog();
      setDiscoveredPeers(discoveredPeers.filter(p => p.endpointId !== device.endpointId));
      onEndpointConnected(device.endpointId);
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