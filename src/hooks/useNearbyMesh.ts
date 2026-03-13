import { useEffect, useState, useCallback, useRef } from 'react';
import { NativeModules, Platform } from 'react-native';
import { getDeviceId } from '@/src/utils/DeviceID';
import {
  NEARBY_EVENTS,
  NearbyEmitter,
  nearbyStart,
  nearbyStartAdvertising,
  nearbyStartDiscovery,
  nearbyRequestPermissions,
} from '@/src/native/NearbyConnections';
import {
  sendScan,
  onPeerConnected,
  setProtocolCallbacks,
  flushOutbox,
  receiveMessage,
  getPeerRTT,
  type ScanPayload,
} from '@/src/services/MeshProtocols';
import {
  NearbyDevice,
  NearbyPayloadEvent,
} from '@/src/types/Nearby.types';
import { getMeshName, getProfile } from '@/src/services/ProfileService';

const { NearbyModule } = NativeModules;

export type { ScanPayload };

export interface PeerInfo {
  endpointId: string;
  deviceName: string;
  rttMs: number | null;
  lastSeenAt: number;
}

export interface MeshState {
  peers: PeerInfo[];
  isMeshActive: boolean;
  lastSyncedTicketId: string | null;
  lastSyncedFrom: string | null;
}

export function useNearbyMesh() {
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [isMeshActive, setIsMeshActive] = useState(false);
  const [lastSynced, setLastSynced] = useState<{ ticketId: string; from: string } | null>(null);

  const localDeviceIdRef = useRef<string>('');
  const localDeviceNameRef = useRef<string>('');

  useEffect(() => {
    setProtocolCallbacks({
      onTicketSyncedFromPeer: (payload) => {
        console.log(`[Mesh] 🎫 Synced ${payload.ticketId} from ${payload.deviceName}`);
        setLastSynced({ ticketId: payload.ticketId, from: payload.deviceName });
      },

      onPeerRTT: (deviceId, rttMs) => {
        setPeers(prev => prev.map(p =>
          p.deviceName === deviceId ? { ...p, rttMs } : p
        ));
      },

      onAckReceived: (ticketId, fromDeviceId) => {
        console.log(`[Mesh] ✅ ACK: ${ticketId} confirmed by ${fromDeviceId}`);
      },
    });
  }, []);

  const startMesh = useCallback(async () => {
    if (Platform.OS !== 'android' || !NearbyModule) return;

    try {
      const meshName = await getMeshName();
      const profile = await getProfile();
      const deviceId = await getDeviceId();

      localDeviceIdRef.current = deviceId;
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

  const broadcastScan = useCallback(async (payload: ScanPayload) => {
    if (!NearbyModule) return;
    await sendScan(payload);
  }, []);

  useEffect(() => {
    if (!NearbyEmitter) return;
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
            rttMs: null,
            lastSeenAt: Date.now(),
          }];
        });

        await onPeerConnected(localDeviceIdRef.current, device.deviceName);
      }
    );

    const onDisconnected = NearbyEmitter.addListener(
      NEARBY_EVENTS.DISCONNECTED,
      (device: NearbyDevice) => {
        console.log(`[Mesh] ❌ Peer disconnected: ${device.deviceName}`);
        setPeers(prev => prev.filter(p => p.endpointId !== device.endpointId));
      }
    );

    const onPayload = NearbyEmitter.addListener(
      NEARBY_EVENTS.PAYLOAD,
      async (event: { endpointId: string; payload: string }) => {
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
    peers,
    isMeshActive,
    peerCount: peers.length,
    lastSyncedTicketId: lastSynced?.ticketId ?? null,
    lastSyncedFrom: lastSynced?.from ?? null,

    startMesh,
    broadcastScan,

    getPeerRTT,
    localDeviceName: localDeviceNameRef.current,
  };
}