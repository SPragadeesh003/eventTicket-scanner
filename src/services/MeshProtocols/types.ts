export type MeshMessage =
  | { type: 'SCAN'; payload: ScanPayload; msgId?: string }
  | { type: 'ACK'; ticketId: string; eventId: string; fromDeviceId: string; msgId?: string }
  | { type: 'CATCHUP'; fromDeviceId: string; msgId?: string }
  | { type: 'PING'; fromDeviceId: string; ts: number; msgId?: string }
  | { type: 'PONG'; fromDeviceId: string; pingTs: number; pongTs: number; msgId?: string };

export interface ScanPayload {
  ticketId: string;
  eventId: string;
  deviceId: string;
  deviceName: string;
  gateNumber: number;
  scannedAt: number;
}

export type ProtocolCallbacks = {
  onTicketSyncedFromPeer: (payload: ScanPayload) => void;
  onPeerRTT: (deviceId: string, rttMs: number) => void;
  onAckReceived: (ticketId: string, fromDeviceId: string) => void;
  onTransportDetected?: (isBLE: boolean, rttMs: number) => void;
};
