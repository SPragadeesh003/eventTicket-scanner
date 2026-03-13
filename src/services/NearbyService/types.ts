import { NearbyDevice } from '@/src/types/Nearby.types';
import { ScanPayload } from '@/src/services/MeshProtocols';

export type { ScanPayload };

export interface NearbyCallbacks {
  onTicketScannedByPeer?: (payload: ScanPayload) => void;
  onDeviceConnected?: (device: NearbyDevice) => void;
  onDeviceDisconnected?: (device: NearbyDevice) => void;
  onDeviceFound?: (device: NearbyDevice) => void;
  onPermissionDenied?: (missing: string[]) => void;
  onTransportDetected?: (isBLE: boolean, rttMs: number) => void;
}
