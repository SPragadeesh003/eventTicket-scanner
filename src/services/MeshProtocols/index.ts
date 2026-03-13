export * from './types';
export * from './constants';
export * from './state';
export * from './heartbeat';
export * from './outbox';
export * from './sender';
export * from './handlers';

import {
  setCallbacks,
  setForceReconnectFn,
  rttMap,
  activeTransportIsBLE,
  pendingAcks,
  setFlushInProgress,
  setLastFlushAt,
  registerFlushOutbox,
  registerBroadcastMessage,
  registerStartAckTimeout,
  registerContinueAckTimeout,
} from './state';
import { stopHeartbeat } from './heartbeat';
import { ProtocolCallbacks } from './types';
import { flushOutbox } from './outbox';
import { broadcastMessage, startAckTimeout, continueAckTimeout } from './sender';

registerFlushOutbox(flushOutbox);
registerBroadcastMessage(broadcastMessage);
registerStartAckTimeout(startAckTimeout);
registerContinueAckTimeout(continueAckTimeout);

export function setProtocolCallbacks(cb: ProtocolCallbacks) {
  setCallbacks(cb);
  console.log('[MeshProtocol] ✅ Callbacks registered');
}

export function setForceReconnect(fn: () => Promise<void>): void {
  setForceReconnectFn(fn);
}

export function clearAllAckTimeouts(): void {
  for (const [ticketId, entry] of pendingAcks) {
    clearTimeout(entry.handle);
    console.log(`[MeshProtocol] 🧹 Cleared stale ACK timeout: ${ticketId}`);
  }
  pendingAcks.clear();
  setFlushInProgress(false);
  setLastFlushAt(0);
  stopHeartbeat();
  console.log('[MeshProtocol] 🧹 All ACK timeouts cleared — clean slate for new session');
}

export function clearHeartbeat(): void {
  stopHeartbeat();
}

export function getPeerRTT(deviceId: string): number | null {
  return rttMap.get(deviceId) ?? null;
}

export function getActiveTransport(): 'wifi-direct' | 'ble' {
  return activeTransportIsBLE ? 'ble' : 'wifi-direct';
}