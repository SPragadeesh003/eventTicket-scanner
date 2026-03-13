import { database } from '@/src/db/database';
import { nearbyBroadcast, nearbyGetDevices } from '@/src/native/NearbyConnections';
import MeshOutbox from '@/src/db/MeshOutbox';
import {
  ACK_MAX_RETRIES,
  ACK_TIMEOUT_WIFI,
  ACK_BACKOFF_WIFI,
  ACK_TIMEOUT_BLE,
  ACK_BACKOFF_BLE
} from './constants';
import {
  activeTransportIsBLE,
  pendingAcks,
  _forceReconnect,
  _registry,
  reconnectInProgress,
} from './state';
import { MeshMessage, ScanPayload } from './types';

function makeMsgId(type: string): string {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function broadcastMessage(message: MeshMessage, label = ''): Promise<boolean> {
  const tag = label || message.type;
  const stamped = { ...message, msgId: (message as any).msgId ?? makeMsgId(message.type) };

  console.log(`[MeshProtocol] 📡 broadcast [${tag}] — ${JSON.stringify(stamped).length} bytes`);

  try {
    const result = await nearbyBroadcast(stamped);
    if (result) {
      console.log(`[MeshProtocol] ✅ broadcast [${tag}] SUCCESS`);
    } else {
      console.warn(`[MeshProtocol] ⚠️ broadcast [${tag}] returned false — no connected peers`);
    }
    return !!result;
  } catch (e: any) {
    console.error(`[MeshProtocol] ❌ broadcast [${tag}] THREW: ${e?.message ?? e}`);
    return false;
  }
}

export function startAckTimeout(ticketId: string, retryCount = 0): void {
  clearAckTimeout(ticketId);

  const backoffs = activeTransportIsBLE ? ACK_BACKOFF_BLE : ACK_BACKOFF_WIFI;
  const timeoutMs = retryCount === 0
    ? (activeTransportIsBLE ? ACK_TIMEOUT_BLE : ACK_TIMEOUT_WIFI)
    : (backoffs[retryCount - 1] ?? backoffs[backoffs.length - 1]);

  const transport = activeTransportIsBLE ? '📶 BLE' : '📡 WiFi Direct';

  const handle = setTimeout(async () => {
    pendingAcks.delete(ticketId);

    if (retryCount >= ACK_MAX_RETRIES) {
      let peerCount = 0;
      try {
        const devices = await nearbyGetDevices();
        peerCount = devices.length;
      } catch (_) { }

      if (peerCount === 0) {
        console.warn(`[MeshProtocol] ⚠️ ACK retries exhausted for ${ticketId} — no peers, skip force reconnect`);
        return;
      }

      console.warn(`[MeshProtocol] ❌ ACK FAILED after ${ACK_MAX_RETRIES} retries for ${ticketId} — forcing reconnect`);
      if (_forceReconnect) {
        try { await _forceReconnect(); }
        catch (e) { console.error('[MeshProtocol] forceReconnect error:', e); }
      }
      return;
    }

    const nextRetry = retryCount + 1;
    console.warn(`[MeshProtocol] ⏱️ ACK TIMEOUT for ${ticketId} [${transport}] (attempt ${nextRetry}/${ACK_MAX_RETRIES + 1}) — re-flushing outbox`);

    startAckTimeout(ticketId, nextRetry);
    await _registry.flushOutbox?.(true);

  }, timeoutMs);

  pendingAcks.set(ticketId, { handle, retryCount });
  console.log(`[MeshProtocol] ⏱️ ACK timeout [${transport}] for ${ticketId} — attempt ${retryCount + 1}, ${timeoutMs / 1000}s`);
}

export function clearAckTimeout(ticketId: string): void {
  const entry = pendingAcks.get(ticketId);
  if (entry !== undefined) {
    clearTimeout(entry.handle);
    pendingAcks.delete(ticketId);
  }
}

export function continueAckTimeout(ticketId: string): void {
  const existing = pendingAcks.get(ticketId);
  const nextRetry = existing ? existing.retryCount + 1 : 1;
  startAckTimeout(ticketId, nextRetry);
}

export async function sendScan(payload: ScanPayload): Promise<void> {
  if (reconnectInProgress) {
    console.log(`[MeshProtocol] ⏸️ sendScan: waiting for reconnect to finish (${payload.ticketId})`);
    await new Promise<void>(resolve => {
      const check = setInterval(() => {
        if (!reconnectInProgress) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(); }, 3_000);
    });
    console.log(`[MeshProtocol] ▶️ sendScan: reconnect done, proceeding (${payload.ticketId})`);
  }

  const now = Date.now();
  console.log(`[MeshProtocol] 📤 SEND SCAN: ${payload.ticketId}`);

  try {
    await database.write(async () => {
      await database.get<MeshOutbox>('mesh_outbox').create((e: any) => {
        e.ticket_id = payload.ticketId;
        e.event_id = payload.eventId;
        e.device_id = payload.deviceId;
        e.device_name = payload.deviceName;
        e.gate_number = payload.gateNumber;
        e.scanned_at = payload.scannedAt;
        e.delivered = false;
        e.retry_count = 0;
        e.last_tried_at = now;
        e.created_at = now;
      });
    });
  } catch (e) {
    console.error(`[MeshProtocol] ❌ OUTBOX SAVE FAILED:`, e);
  }

  let hasPeers = false;
  try {
    const devices = await nearbyGetDevices();
    hasPeers = devices.length > 0;
  } catch (e) { }

  const sent = await broadcastMessage({ type: 'SCAN', payload }, `SCAN:${payload.ticketId}`);

  if (sent && hasPeers) {
    startAckTimeout(payload.ticketId, 0);
  }
}