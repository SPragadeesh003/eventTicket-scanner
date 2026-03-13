import { database } from '@/src/db/database';
import { Q } from '@nozbe/watermelondb';
import { Ticket, ScanLog } from '@/src/db/models';
import {
  SEEN_MSG_MAX,
  SEEN_MSG_TTL_MS,
  RTT_WIFI_THRESHOLD_MS,
} from './constants';
import {
  seenMsgIds,
  setLastPongReceivedAt,
  pingSentAt,
  peerDeviceIdForHeartbeat,
  setPeerDeviceIdForHeartbeat,
  heartbeatDeviceId,
  activeTransportIsBLE,
  setActiveTransportIsBLE,
  rttMap,
  callbacks,
} from './state';
import { MeshMessage, ScanPayload } from './types';
import { applyHeartbeatRole, startHeartbeat, clearPongTimeout, sendHeartbeatPing } from './heartbeat';
import { markOutboxDelivered, flushOutbox } from './outbox';
import { broadcastMessage, clearAckTimeout, startAckTimeout } from './sender';

function isDuplicate(msgId: string | undefined): boolean {
  if (!msgId) return false;
  const now = Date.now();
  if (seenMsgIds.size >= SEEN_MSG_MAX) {
    for (const [id, ts] of seenMsgIds) {
      if (now - ts > SEEN_MSG_TTL_MS) seenMsgIds.delete(id);
    }
  }
  if (seenMsgIds.has(msgId)) return true;
  seenMsgIds.set(msgId, now);
  return false;
}

async function applyPeerScan(payload: ScanPayload): Promise<void> {
  await database.write(async () => {
    const tickets = await database.get<Ticket>('tickets')
      .query(Q.where('ticket_id', payload.ticketId), Q.where('event_id', payload.eventId))
      .fetch();

    if (tickets.length === 0) return;
    const ticket = tickets[0];

    const existingLogs = await database.get<ScanLog>('scan_logs')
      .query(Q.where('ticket_id', payload.ticketId), Q.where('is_duplicate', Q.eq(false)))
      .fetch();

    if (existingLogs.length > 0) {
      if (existingLogs[0].scanned_at <= payload.scannedAt) return;
    }

    if (ticket.status !== 'used') {
      await ticket.update((t: Ticket) => { t.status = 'used'; });
    }

    if (existingLogs.length === 0) {
      await database.get<ScanLog>('scan_logs').create((log: ScanLog) => {
        log.ticket_id = payload.ticketId;
        log.event_id = payload.eventId;
        log.device_id = payload.deviceId;
        log.gate_number = payload.gateNumber;
        log.device_name = payload.deviceName;
        log.scanned_at = payload.scannedAt;
        log.uploaded = false;
        log.is_duplicate = false;
      });
    }
  });
}

export async function receiveMessage(raw: string, fromEndpointId: string, localDeviceId: string): Promise<void> {
  let message: MeshMessage;
  try {
    message = JSON.parse(raw);
  } catch (e) { return; }

  const dedupKey = message.msgId ?? (message.type === 'PONG' ? `PONG:${(message as any).fromDeviceId}:${(message as any).pingTs}` : undefined);
  if (isDuplicate(dedupKey)) return;

  switch (message.type) {
    case 'SCAN': {
      if (message.payload.deviceId === localDeviceId) return;

      const [,] = await Promise.all([
        applyPeerScan(message.payload),
        broadcastMessage({
          type: 'ACK',
          ticketId: message.payload.ticketId,
          eventId: message.payload.eventId,
          fromDeviceId: localDeviceId,
        }, `ACK:${message.payload.ticketId}`),
      ]);

      callbacks?.onTicketSyncedFromPeer(message.payload);
      break;
    }
    case 'ACK': {
      if (message.fromDeviceId === localDeviceId) return;
      clearAckTimeout(message.ticketId);
      markOutboxDelivered(message.ticketId, message.eventId).catch(e =>
        console.error('[MeshProtocol] markOutboxDelivered error:', e)
      );
      callbacks?.onAckReceived(message.ticketId, message.fromDeviceId);
      break;
    }
    case 'CATCHUP': {
      if (message.fromDeviceId === localDeviceId) return;
      flushOutbox(true).catch(e => console.error('[MeshProtocol] CATCHUP flush error:', e));
      break;
    }
    case 'PING': {
      if (message.fromDeviceId === localDeviceId) return;
      setLastPongReceivedAt(Date.now());
      const pongMsgId = message.msgId ? `PONG-reply-${message.msgId}` : undefined;
      broadcastMessage({
        type: 'PONG',
        fromDeviceId: localDeviceId,
        pingTs: message.ts,
        pongTs: Date.now(),
        msgId: pongMsgId,
      } as any, 'PONG').catch(() => {});
      break;
    }
    case 'PONG': {
      if (message.fromDeviceId === localDeviceId) return;
      setLastPongReceivedAt(Date.now());
      clearPongTimeout();
      const sentAt = message.msgId ? pingSentAt.get(message.msgId) : undefined;
      const rtt = sentAt !== undefined ? (Date.now() - sentAt) : Math.abs(Date.now() - message.pingTs);

      if (peerDeviceIdForHeartbeat !== message.fromDeviceId) {
        setPeerDeviceIdForHeartbeat(message.fromDeviceId);
        if (heartbeatDeviceId && message.fromDeviceId.startsWith('android-')) {
          const broadcastPingLambda = () =>
            broadcastMessage({ type: 'PING', fromDeviceId: heartbeatDeviceId, ts: Date.now() }, 'PING');
          applyHeartbeatRole(heartbeatDeviceId, message.fromDeviceId, broadcastPingLambda);
        }
      }
      rttMap.set(message.fromDeviceId, rtt);
      setActiveTransportIsBLE(rtt >= RTT_WIFI_THRESHOLD_MS);

      callbacks?.onPeerRTT(message.fromDeviceId, rtt);
      callbacks?.onTransportDetected?.(activeTransportIsBLE, rtt);
      break;
    }
  }
}

export async function onPeerConnected(localDeviceId: string, peerDeviceName: string): Promise<void> {
  const broadcastPingLambda = () =>
    broadcastMessage({ type: 'PING', fromDeviceId: localDeviceId, ts: Date.now() }, 'PING');

  await Promise.all([
    broadcastMessage({ type: 'CATCHUP', fromDeviceId: localDeviceId }, 'CATCHUP'),
    sendHeartbeatPing(broadcastPingLambda),
  ]);

  flushOutbox(true).catch(e => console.error('[MeshProtocol] onPeerConnected flush error:', e));

  setPeerDeviceIdForHeartbeat(peerDeviceName);
  startHeartbeat(localDeviceId, peerDeviceName, broadcastPingLambda);
}