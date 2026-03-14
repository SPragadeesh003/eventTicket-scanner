import {
  HEARTBEAT_INTERVAL_MS,
  PONG_TIMEOUT_MS_WIFI,
  PONG_TIMEOUT_MS_BLE
} from './constants';
import {
  heartbeatTimer,
  pongTimeoutTimer,
  heartbeatDeviceId,
  lastPongReceivedAt,
  peerDeviceIdForHeartbeat,
  heartbeatRoleAssigned,
  heartbeatIsSender,
  setHeartbeatTimer,
  setPongTimeoutTimer,
  setHeartbeatDeviceId,
  setLastPongReceivedAt,
  setPeerDeviceIdForHeartbeat,
  setHeartbeatRoleAssigned,
  setHeartbeatIsSender,
  pingSentAt,
  activeTransportIsBLE,
  _forceReconnect
} from './state';

export function stopHeartbeat(): void {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    setHeartbeatTimer(null);
  }
  clearPongTimeout();
  setHeartbeatRoleAssigned(false);
  setHeartbeatIsSender(false);
  setPeerDeviceIdForHeartbeat('');
  setHeartbeatDeviceId('');
  console.log('[MeshProtocol] 💓 Heartbeat stopped');
}

export function clearPongTimeout(): void {
  if (pongTimeoutTimer !== null) {
    clearTimeout(pongTimeoutTimer);
    setPongTimeoutTimer(null);
  }
}

export async function sendHeartbeatPing(broadcastMessage: any): Promise<void> {
  const pingTs = Date.now();
  const msgId = `PING-${pingTs}-${Math.random().toString(36).slice(2, 7)}`;

  pingSentAt.set(msgId, pingTs);
  const cutoff = pingTs - 30_000;
  for (const [id, ts] of pingSentAt) {
    if (ts < cutoff) pingSentAt.delete(id);
  }

  const sent = await broadcastMessage(
    { type: 'PING', fromDeviceId: heartbeatDeviceId, ts: pingTs, msgId },
    'PING'
  );

  if (!sent) {
    console.warn('[MeshProtocol] 💓 Heartbeat PING returned false — no peers, stopping heartbeat');
    stopHeartbeat();
    return;
  }

  clearPongTimeout();
  const timeoutMs = activeTransportIsBLE ? PONG_TIMEOUT_MS_BLE : PONG_TIMEOUT_MS_WIFI;
  setPongTimeoutTimer(setTimeout(async () => {
    setPongTimeoutTimer(null);
    console.warn(`[MeshProtocol] 💔 PONG timeout after ${timeoutMs}ms — WiFi Direct group silently died — forcing reconnect`);
    stopHeartbeat();
    if (_forceReconnect) {
      try { await _forceReconnect(); }
      catch (e) { console.error('[MeshProtocol] forceReconnect from PONG timeout error:', e); }
    }
  }, timeoutMs));
}

export function applyHeartbeatRole(localDeviceId: string, peerDeviceId: string, broadcastPing: any): void {
  const iAmSender = localDeviceId < peerDeviceId;

  if (heartbeatRoleAssigned && heartbeatIsSender === iAmSender && peerDeviceIdForHeartbeat === peerDeviceId) {
    return;
  }

  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    setHeartbeatTimer(null);
  }

  setHeartbeatRoleAssigned(true);
  setHeartbeatIsSender(iAmSender);
  setPeerDeviceIdForHeartbeat(peerDeviceId); // FIX: was never set, causing stale role on reconnect

  if (iAmSender) {
    setHeartbeatTimer(setInterval(() => {
      broadcastPing();
    }, HEARTBEAT_INTERVAL_MS));
    console.log(`[MeshProtocol] 💓 Heartbeat SENDER (my ...${localDeviceId.slice(-4)} < peer ...${peerDeviceId.slice(-4)})`);
  } else {
    setHeartbeatTimer(setInterval(() => {
      const elapsed = Date.now() - lastPongReceivedAt;
      if (elapsed > HEARTBEAT_INTERVAL_MS * 2.5) {
        console.warn(`[MeshProtocol] 💔 No PING in ${elapsed}ms — sender died — forcing reconnect`);
        stopHeartbeat();
        if (_forceReconnect) {
          _forceReconnect().catch(e => console.error('[MeshProtocol] forceReconnect from PING watchdog:', e));
        }
      }
    }, HEARTBEAT_INTERVAL_MS));
    console.log(`[MeshProtocol] 💓 Heartbeat RESPONDER (my ...${localDeviceId.slice(-4)} > peer ...${peerDeviceId.slice(-4)})`);
  }
}

export function startHeartbeat(localDeviceId: string, peerDeviceId: string, broadcastPing: any): void {
  stopHeartbeat();
  setHeartbeatDeviceId(localDeviceId);
  setLastPongReceivedAt(Date.now());

  const peerIsRealId = peerDeviceId.startsWith('android-');

  if (!peerIsRealId) {
    setHeartbeatTimer(setInterval(() => {
      const elapsed = Date.now() - lastPongReceivedAt;
      if (elapsed > HEARTBEAT_INTERVAL_MS * 2.5) {
        console.warn(`[MeshProtocol] 💔 No PING/PONG in ${elapsed}ms — forcing reconnect`);
        stopHeartbeat();
        if (_forceReconnect) {
          _forceReconnect().catch(e => console.error('[MeshProtocol] forceReconnect from watchdog:', e));
        }
      }
    }, HEARTBEAT_INTERVAL_MS));
    console.log(`[MeshProtocol] 💓 Heartbeat pending role assignment (peer: ${peerDeviceId})`);
    return;
  }

  applyHeartbeatRole(localDeviceId, peerDeviceId, broadcastPing);
}