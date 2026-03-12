import { useEffect, useState, useCallback, useRef } from 'react';
import { NativeModules, Platform } from 'react-native';
import { getDeviceId } from '@/src/utils/DeviceID';
import {
  nearbyStart,
  nearbyStartAdvertising,
  nearbyStartDiscovery,
  nearbyRequestPermissions,
  NEARBY_EVENTS,
  NearbyEmitter,
  type NearbyDevice,
} from '@/src/native/NearbyConnections';
import {
  sendScan,
  receiveMessage,
  onPeerConnected,
  flushOutbox,
  setProtocolCallbacks,
  getPeerRTT,
  type ScanPayload,
} from '@/src/services/MeshProtocol';
import { getMeshName, getProfile } from '@/src/services/ProfileService';

const { NearbyModule } = NativeModules;

// ─── Types ────────────────────────────────────────────────────────────────────
export type { ScanPayload };

export interface PeerInfo {
  endpointId: string;
  deviceName: string;
  rttMs:      number | null;   // null = not yet measured
  lastSeenAt: number;          // epoch ms
}

export interface MeshState {
  peers:        PeerInfo[];
  isMeshActive: boolean;
  lastSyncedTicketId: string | null;  // feedback: last ticket synced from peer
  lastSyncedFrom:     string | null;  // which gate synced it
}

// ─────────────────────────────────────────────────────────────────────────────
export function useNearbyMesh() {
  const [peers,        setPeers]        = useState<PeerInfo[]>([]);
  const [isMeshActive, setIsMeshActive] = useState(false);
  const [lastSynced,   setLastSynced]   = useState<{ ticketId: string; from: string } | null>(null);

  const localDeviceIdRef   = useRef<string>('');
  const localDeviceNameRef = useRef<string>('');

  // ─── Register protocol callbacks ─────────────────────────────────────────
  useEffect(() => {
    setProtocolCallbacks({
      // Fired when a peer scan is received and applied to local DB
      onTicketSyncedFromPeer: (payload) => {
        console.log(`[Mesh] 🎫 Synced ${payload.ticketId} from ${payload.deviceName}`);
        setLastSynced({ ticketId: payload.ticketId, from: payload.deviceName });
      },

      // Fired when RTT is measured after PING/PONG
      onPeerRTT: (deviceId, rttMs) => {
        setPeers(prev => prev.map(p =>
          p.deviceName === deviceId ? { ...p, rttMs } : p
        ));
      },

      // Fired when peer ACKs one of our outbox entries
      onAckReceived: (ticketId, fromDeviceId) => {
        console.log(`[Mesh] ✅ ACK: ${ticketId} confirmed by ${fromDeviceId}`);
      },
    });
  }, []);

  // ─── Start mesh ───────────────────────────────────────────────────────────
  const startMesh = useCallback(async () => {  // ← no gateNumber param needed anymore
  if (Platform.OS !== 'android' || !NearbyModule) return;
 
  try {
    // Get mesh name from cached profile ("Gatekeeper 1 - Gate 1")
    const meshName = await getMeshName();
    const profile  = await getProfile();
    const deviceId = await getDeviceId();
 
    localDeviceIdRef.current   = deviceId;
    localDeviceNameRef.current = meshName;
 
    console.log(`[Mesh] Starting as: ${meshName}`);
    console.log(`[Mesh] Scanner #${profile?.scannerNumber} — ${profile?.deviceName}`);
 
    const granted = await nearbyRequestPermissions();
    if (!granted) {
      console.warn('[Mesh] Permissions denied');
      return;
    }
 
    const initialized = await nearbyStart(meshName);
    if (!initialized) {
      console.error('[Mesh] Failed to initialize native module');
      return;
    }
 
    await nearbyStartAdvertising(meshName);
    await nearbyStartDiscovery();
 
    setIsMeshActive(true);
    console.log(`[Mesh] 🌐 Active: ${meshName}`);
 
    await flushOutbox();
  } catch (error) {
    console.error('[Mesh] Failed to start:', error);
  }
}, []);

  // ─── Broadcast a scan (called from validateTicket) ────────────────────────
  const broadcastScan = useCallback(async (payload: ScanPayload) => {
    if (!NearbyModule) return;
    await sendScan(payload); // goes through MeshProtocol store→forward→ACK
  }, []);

  // ─── Native event listeners ───────────────────────────────────────────────
  useEffect(() => {
    if (!NearbyEmitter) return;

    // ── Peer connected ────────────────────────────────────────────────────
    const onConnected = NearbyEmitter.addListener(
      NEARBY_EVENTS.CONNECTED,
      async (device: NearbyDevice) => {
        if (device.deviceName === localDeviceNameRef.current) return;

        console.log(`[Mesh] ✅ Peer connected: ${device.deviceName}`);

        setPeers(prev => {
          if (prev.find(p => p.endpointId === device.endpointId)) return prev;
          return [...prev, {
            endpointId: device.endpointId,
            deviceName: device.deviceName,
            rttMs:      null,
            lastSeenAt: Date.now(),
          }];
        });

        // Trigger handshake: CATCHUP + flush outbox + PING
        await onPeerConnected(localDeviceIdRef.current, device.deviceName);
      }
    );

    // ── Peer disconnected ─────────────────────────────────────────────────
    const onDisconnected = NearbyEmitter.addListener(
      NEARBY_EVENTS.DISCONNECTED,
      (device: NearbyDevice) => {
        console.log(`[Mesh] ❌ Peer disconnected: ${device.deviceName}`);
        setPeers(prev => prev.filter(p => p.endpointId !== device.endpointId));
      }
    );

    // ── Payload received ──────────────────────────────────────────────────
    const onPayload = NearbyEmitter.addListener(
      NEARBY_EVENTS.PAYLOAD,
      async (event: { endpointId: string; payload: string }) => {
        // Update lastSeenAt for this peer
        setPeers(prev => prev.map(p =>
          p.endpointId === event.endpointId
            ? { ...p, lastSeenAt: Date.now() }
            : p
        ));

        await receiveMessage(
          event.payload,
          event.endpointId,
          localDeviceIdRef.current,
        );
      }
    );

    // ── Debug ─────────────────────────────────────────────────────────────
    const onDebug = NearbyEmitter.addListener(
      NEARBY_EVENTS.DEBUG,
      (e: { message: string }) => console.log('[Nearby]', e.message)
    );

    const onStatus = NearbyEmitter.addListener(
      NEARBY_EVENTS.STATUS,
      (e: { status: string }) => console.log('[Nearby STATUS]', e.status)
    );

    const onReconnect = NearbyEmitter.addListener(
      NEARBY_EVENTS.RECONNECT,
      (e: { endpointId: string; attempt: number }) =>
        console.log(`[Nearby] Reconnecting to ${e.endpointId} attempt ${e.attempt}`)
    );

    return () => {
      onConnected.remove();
      onDisconnected.remove();
      onPayload.remove();
      onDebug.remove();
      onStatus.remove();
      onReconnect.remove();
    };
  }, []);

  return {
    // Mesh state
    peers,
    isMeshActive,
    peerCount: peers.length,

    // Last sync feedback for UI
    lastSyncedTicketId: lastSynced?.ticketId ?? null,
    lastSyncedFrom:     lastSynced?.from     ?? null,

    // Actions
    startMesh,
    broadcastScan,

    // Helpers
    getPeerRTT,
    localDeviceName: localDeviceNameRef.current,
  };
}