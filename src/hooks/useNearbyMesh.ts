import { useEffect, useState, useCallback } from 'react';
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { database } from '@/src/db/database';
import { getDeviceId } from '@/src/utils/DeviceID';
import type { Ticket, ScanLog } from '@/src/db/models';
import { 
  nearbyStart, 
  nearbyStartAdvertising, 
  nearbyStartDiscovery, 
  nearbyBroadcast, 
  nearbyRequestPermissions,
  NEARBY_EVENTS,
  NearbyEmitter,
  type NearbyDevice
} from '@/src/native/NearbyConnections';
import { Q } from '@nozbe/watermelondb';

const { NearbyModule } = NativeModules;

export interface ScanPayload {
  type: 'SCAN';
  ticketId: string;
  eventId: string;
  scannedAt: number;
  gateNumber: number;
  deviceName: string;
}

export function useNearbyMesh() {
  const [peers, setPeers] = useState<NearbyDevice[]>([]);
  const [isMeshActive, setIsMeshActive] = useState(false);

  // ─── 1. Start the Mesh ──────────────────────────────────────────
  const startMesh = useCallback(async (gateNumber: number) => {
    if (Platform.OS !== 'android' || !NearbyModule) return;

    try {
      const deviceId = await getDeviceId();
      const deviceName = `Gate-${gateNumber}-${deviceId.slice(-4).toUpperCase()}`;

      // 0. Request Permissions (Android 12+)
      await nearbyRequestPermissions();

      // Start the service (init managers/permissions)
      const initialized = await nearbyStart(deviceName);
      if (!initialized) return;

      // Start Advertising AND Discovering
      await nearbyStartAdvertising(deviceName);
      await nearbyStartDiscovery();
      
      setIsMeshActive(true);
      console.log('🌐 Offline Mesh initialized successfully!');
    } catch (error) {
      console.error('Failed to start mesh:', error);
    }
  }, []);

  // ─── 2. Broadcast a Scan ────────────────────────────────────────
  const broadcastScan = useCallback(async (payload: ScanPayload) => {
    if (!NearbyModule) return;
    try {
      await nearbyBroadcast(payload);
    } catch (error) {
      console.error('Failed to broadcast payload:', error);
    }
  }, []);

  // ─── 3. Listen for Native Events ────────────────────────────────
  useEffect(() => {
    if (!NearbyEmitter) return;

    const onPeerConnected = NearbyEmitter.addListener(NEARBY_EVENTS.CONNECTED, async (device: NearbyDevice) => {
      const deviceId = await getDeviceId();
      const suffix = deviceId.slice(-4).toUpperCase();
      
      // Filter out any device that has our same ID suffix (likely us)
      if (device.deviceName.endsWith(suffix)) return;

      setPeers((prev) => {
        if (prev.find(p => p.endpointId === device.endpointId)) return prev;
        return [...prev, device];
      });
    });

    const onPeerDisconnected = NearbyEmitter.addListener(NEARBY_EVENTS.DISCONNECTED, (device: NearbyDevice) => {
      setPeers((prev) => prev.filter((d) => d.endpointId !== device.endpointId));
    });

    const onPayloadReceived = NearbyEmitter.addListener(NEARBY_EVENTS.PAYLOAD, async (event: { endpointId: string, payload: string }) => {
      try {
        const data = JSON.parse(event.payload) as ScanPayload;
        
        if (data.type === 'SCAN') {
          console.log(`🎫 Mesh Sync: Payload received for Ticket #${data.ticketId}`);

          await database.write(async () => {
            // 1. Mark the ticket as used
            const tickets = await database.get<Ticket>('tickets').query(
              Q.where('ticket_id', data.ticketId),
              Q.where('event_id', data.eventId)
            ).fetch();

            if (tickets.length > 0 && tickets[0].status !== 'used') {
              await tickets[0].update((ticket: Ticket) => {
                ticket.status = 'used';
              });
              console.log(`✅ Ticket #${data.ticketId} marked as used.`);
            }

            // 2. Add to local scan logs if it doesn't exist
            const existingLogs = await database.get<ScanLog>('scan_logs').query(
              Q.where('ticket_id', data.ticketId)
            ).fetch();

            if (existingLogs.length === 0) {
              await database.get<ScanLog>('scan_logs').create((log: ScanLog) => {
                log.ticket_id = data.ticketId;
                log.event_id = data.eventId;
                log.device_id = 'PEER_DEVICE';
                log.gate_number = data.gateNumber;
                log.device_name = data.deviceName;
                log.scanned_at = data.scannedAt;
                log.uploaded = false; 
              });
              console.log(`📝 Added scan log for #${data.ticketId}`);
            }
          });
        }
      } catch (err) {
        console.error('Error parsing received payload:', err);
      }
    });

    return () => {
      onPeerConnected.remove();
      onPeerDisconnected.remove();
      onPayloadReceived.remove();
    };
  }, []);

  return { startMesh, broadcastScan, peers, isMeshActive };
}
