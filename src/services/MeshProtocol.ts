/**
 * MeshProtocol.ts — Store → Forward → Acknowledge
 *
 * Message types:
 *   SCAN     — ticket scanned, must be ACKed
 *   ACK      — confirm SCAN received and applied
 *   CATCHUP  — request undelivered outbox on connect
 *   PING     — connectivity check with timestamp
 *   PONG     — response to PING
 */

import { database } from '@/src/db/database';
import { Q }        from '@nozbe/watermelondb';
import { nearbyBroadcast, nearbyGetDevices } from '@/src/native/NearbyConnections';
import MeshOutbox from '@/src/db/MeshOutbox';
import type { Ticket, ScanLog } from '@/src/db/models';

// ─── Message shapes ───────────────────────────────────────────────────────────
// Every message carries a unique msgId.
// Nearby deduplicates BYTES payloads by content hash -- same bytes = silently dropped.
// msgId ensures uniqueness even for rapid repeated scans of the same ticket.
export type MeshMessage =
  | { type: 'SCAN';    payload: ScanPayload; msgId?: string }
  | { type: 'ACK';     ticketId: string; eventId: string; fromDeviceId: string; msgId?: string }
  | { type: 'CATCHUP'; fromDeviceId: string; msgId?: string }
  | { type: 'PING';    fromDeviceId: string; ts: number; msgId?: string }
  | { type: 'PONG';    fromDeviceId: string; pingTs: number; pongTs: number; msgId?: string };

function makeMsgId(type: string): string {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface ScanPayload {
  ticketId:   string;
  eventId:    string;
  deviceId:   string;
  deviceName: string;
  gateNumber: number;
  scannedAt:  number;
}

// MeshOutbox removed \u2014 use MeshOutbox model directly


// ─── RTT tracking ─────────────────────────────────────────────────────────────
const pendingPings = new Map<string, number>();
const rttMap       = new Map<string, number>();

// ─── Callbacks ────────────────────────────────────────────────────────────────
type ProtocolCallbacks = {
  onTicketSyncedFromPeer: (payload: ScanPayload) => void;
  onPeerRTT:              (deviceId: string, rttMs: number) => void;
  onAckReceived:          (ticketId: string, fromDeviceId: string) => void;
};

let callbacks: ProtocolCallbacks | null = null;

export function setProtocolCallbacks(cb: ProtocolCallbacks) {
  callbacks = cb;
  console.log('[MeshProtocol] ✅ Callbacks registered');
}

// ─────────────────────────────────────────────────────────────────────────────
//  SEND — write to outbox + broadcast immediately
// ─────────────────────────────────────────────────────────────────────────────
export async function sendScan(payload: ScanPayload): Promise<void> {
  const now = Date.now();
  console.log(`[MeshProtocol] ════════════════════════════════`);
  console.log(`[MeshProtocol] 📤 SEND SCAN`);
  console.log(`[MeshProtocol]    ticketId:  ${payload.ticketId}`);
  console.log(`[MeshProtocol]    from:      ${payload.deviceName} (${payload.deviceId})`);
  console.log(`[MeshProtocol]    eventId:   ${payload.eventId}`);
  console.log(`[MeshProtocol]    scannedAt: ${new Date(payload.scannedAt).toISOString()}`);

  // 1. Persist to outbox
  try {
    await database.write(async () => {
      await database.get<MeshOutbox>('mesh_outbox').create((e: any) => {
        e.ticket_id     = payload.ticketId;
        e.event_id      = payload.eventId;
        e.device_id     = payload.deviceId;
        e.device_name   = payload.deviceName;
        e.gate_number   = payload.gateNumber;
        e.scanned_at    = payload.scannedAt;
        e.delivered     = false;
        e.retry_count   = 0;
        e.last_tried_at = now;
        e.created_at    = now;
      });
    });
    console.log(`[MeshProtocol] 💾 Outbox entry saved for: ${payload.ticketId}`);
  } catch (e) {
    console.error(`[MeshProtocol] ❌ OUTBOX SAVE FAILED:`, e);
  }

  // 2. Log connected peers
  try {
    const devices = await nearbyGetDevices();
    console.log(`[MeshProtocol] 📡 Connected peers at send time: ${devices.length}`);
    if (devices.length === 0) {
      console.warn(`[MeshProtocol] ⚠️ No peers — payload saved to outbox, will retry on next connect`);
    } else {
      devices.forEach((d, i) =>
        console.log(`[MeshProtocol]    [${i + 1}] ${d.deviceName} (${d.endpointId})`)
      );
    }
  } catch (e) {
    console.warn(`[MeshProtocol] ⚠️ Could not fetch peer list:`, e);
  }

  // 3. Broadcast
  await broadcastMessage({ type: 'SCAN', payload }, `SCAN:${payload.ticketId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  RECEIVE — handle all incoming messages
// ─────────────────────────────────────────────────────────────────────────────
export async function receiveMessage(
  raw:           string,
  fromEndpointId: string,
  localDeviceId: string,
): Promise<void> {
  console.log(`[MeshProtocol] ════════════════════════════════`);
  console.log(`[MeshProtocol] 📨 RAW MESSAGE RECEIVED`);
  console.log(`[MeshProtocol]    fromEndpoint: ${fromEndpointId}`);
  console.log(`[MeshProtocol]    localId:      ${localDeviceId}`);
  console.log(`[MeshProtocol]    length:       ${raw.length} chars`);
  console.log(`[MeshProtocol]    preview:      ${raw.substring(0, 150)}`);

  let message: MeshMessage;
  try {
    message = JSON.parse(raw);
    console.log(`[MeshProtocol] ✅ Parsed OK — type: ${message.type}`);
  } catch (e) {
    console.error(`[MeshProtocol] ❌ JSON PARSE FAILED`);
    console.error(`[MeshProtocol]    error: ${e}`);
    console.error(`[MeshProtocol]    raw:   ${raw}`);
    return;
  }

  switch (message.type) {

    // ── SCAN ────────────────────────────────────────────────────────────────
    case 'SCAN': {
      const { payload } = message;
      console.log(`[MeshProtocol] 🎫 SCAN message`);
      console.log(`[MeshProtocol]    ticketId:   ${payload.ticketId}`);
      console.log(`[MeshProtocol]    senderName: ${payload.deviceName}`);
      console.log(`[MeshProtocol]    senderId:   ${payload.deviceId}`);
      console.log(`[MeshProtocol]    scannedAt:  ${new Date(payload.scannedAt).toISOString()}`);

      if (payload.deviceId === localDeviceId) {
        console.log(`[MeshProtocol] 🔁 Own echo — ignoring`);
        return;
      }

      console.log(`[MeshProtocol] ⚙️ Applying to local DB...`);
      await applyPeerScan(payload);

      console.log(`[MeshProtocol] 📬 Sending ACK back...`);
      await broadcastMessage({
        type:         'ACK',
        ticketId:     payload.ticketId,
        eventId:      payload.eventId,
        fromDeviceId: localDeviceId,
      }, `ACK:${payload.ticketId}`);

      callbacks?.onTicketSyncedFromPeer(payload);
      break;
    }

    // ── ACK ─────────────────────────────────────────────────────────────────
    case 'ACK': {
      console.log(`[MeshProtocol] ✅ ACK message`);
      console.log(`[MeshProtocol]    ticketId:     ${message.ticketId}`);
      console.log(`[MeshProtocol]    fromDeviceId: ${message.fromDeviceId}`);

      if (message.fromDeviceId === localDeviceId) {
        console.log(`[MeshProtocol] 🔁 Own ACK echo — ignoring`);
        return;
      }

      await markOutboxDelivered(message.ticketId, message.eventId);
      callbacks?.onAckReceived(message.ticketId, message.fromDeviceId);
      break;
    }

    // ── CATCHUP ─────────────────────────────────────────────────────────────
    case 'CATCHUP': {
      console.log(`[MeshProtocol] 🔄 CATCHUP request`);
      console.log(`[MeshProtocol]    from: ${message.fromDeviceId}`);

      if (message.fromDeviceId === localDeviceId) {
        console.log(`[MeshProtocol] 🔁 Own CATCHUP echo — ignoring`);
        return;
      }

      console.log(`[MeshProtocol] 📦 Flushing outbox for catchup...`);
      await flushOutbox();
      break;
    }

    // ── PING ─────────────────────────────────────────────────────────────────
    case 'PING': {
      console.log(`[MeshProtocol] 🏓 PING from: ${message.fromDeviceId}`);

      if (message.fromDeviceId === localDeviceId) return;

      const pongTs = Date.now();
      await broadcastMessage({
        type:         'PONG',
        fromDeviceId: localDeviceId,
        pingTs:       message.ts,
        pongTs,
      }, 'PONG');

      console.log(`[MeshProtocol] 🏓 PONG sent (pongTs: ${pongTs})`);
      break;
    }

    // ── PONG ─────────────────────────────────────────────────────────────────
    case 'PONG': {
      if (message.fromDeviceId === localDeviceId) return;

      const rtt = Date.now() - message.pingTs;
      rttMap.set(message.fromDeviceId, rtt);

      console.log(`[MeshProtocol] 📶 PONG from: ${message.fromDeviceId}`);
      console.log(`[MeshProtocol]    RTT: ${rtt}ms`);
      console.log(`[MeshProtocol]    Link quality: ${
        rtt < 100 ? '🟢 Excellent' :
        rtt < 300 ? '🟡 Good' :
        rtt < 800 ? '🟠 Fair' : '🔴 Poor'
      }`);

      callbacks?.onPeerRTT(message.fromDeviceId, rtt);
      break;
    }

    default:
      console.warn(`[MeshProtocol] ⚠️ Unknown message type: ${(message as any).type}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ON PEER CONNECT — handshake: CATCHUP + flush outbox + PING
// ─────────────────────────────────────────────────────────────────────────────
export async function onPeerConnected(
  localDeviceId:  string,
  peerDeviceName: string,
): Promise<void> {
  console.log(`[MeshProtocol] ════════════════════════════════`);
  console.log(`[MeshProtocol] 🤝 HANDSHAKE with: ${peerDeviceName}`);
  console.log(`[MeshProtocol]    localDeviceId: ${localDeviceId}`);

  // Step 1: Ask peer to send us what we missed
  console.log(`[MeshProtocol] 1️⃣  → CATCHUP request`);
  await broadcastMessage({ type: 'CATCHUP', fromDeviceId: localDeviceId }, 'CATCHUP');

  // Step 2: Send peer what they missed from us
  console.log(`[MeshProtocol] 2️⃣  → Flushing our outbox to peer`);
  await flushOutbox();

  // Step 3: Measure link quality
  const pingTs = Date.now();
  pendingPings.set(localDeviceId, pingTs);
  console.log(`[MeshProtocol] 3️⃣  → PING (ts: ${pingTs})`);
  await broadcastMessage({ type: 'PING', fromDeviceId: localDeviceId, ts: pingTs }, 'PING');

  console.log(`[MeshProtocol] 🤝 Handshake complete for: ${peerDeviceName}`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  FLUSH OUTBOX
// ─────────────────────────────────────────────────────────────────────────────
export async function flushOutbox(): Promise<void> {
  console.log(`[MeshProtocol] 📦 FLUSH OUTBOX — querying undelivered...`);

  let undelivered: MeshOutbox[] = [];
  try {
    undelivered = await database.get<MeshOutbox>('mesh_outbox')
      .query(Q.where('delivered', Q.eq(false)))
      .fetch();
  } catch (e) {
    console.error(`[MeshProtocol] ❌ Outbox query failed:`, e);
    return;
  }

  console.log(`[MeshProtocol] 📦 Undelivered entries: ${undelivered.length}`);

  if (undelivered.length === 0) {
    console.log(`[MeshProtocol] ✅ Nothing to flush`);
    return;
  }

  for (const entry of undelivered) {
    console.log(`[MeshProtocol]    ↳ retry #${entry.retry_count + 1} — ${entry.ticket_id} (created ${new Date(entry.created_at).toISOString()})`);

    const payload: ScanPayload = {
      ticketId:   entry.ticket_id,
      eventId:    entry.event_id,
      deviceId:   entry.device_id,
      deviceName: entry.device_name,
      gateNumber: entry.gate_number,
      scannedAt:  entry.scanned_at,
    };

    await broadcastMessage({ type: 'SCAN', payload }, `RETRY:${entry.ticket_id}`);

    try {
      await database.write(async () => {
        await entry.update((e: any) => {
          e.retry_count   = entry.retry_count + 1;
          e.last_tried_at = Date.now();
        });
      });
    } catch (e) {
      console.error(`[MeshProtocol] ❌ Failed to update retry count for ${entry.ticket_id}:`, e);
    }

    await delay(120);
  }

  console.log(`[MeshProtocol] 📦 Flush done — retried ${undelivered.length} entries`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  APPLY PEER SCAN — first-scan-wins
// ─────────────────────────────────────────────────────────────────────────────
async function applyPeerScan(payload: ScanPayload): Promise<void> {
  console.log(`[MeshProtocol] ⚙️ applyPeerScan: ${payload.ticketId}`);

  await database.write(async () => {
    const tickets = await database
      .get<Ticket>('tickets')
      .query(
        Q.where('ticket_id', payload.ticketId),
        Q.where('event_id',  payload.eventId),
      )
      .fetch();

    if (tickets.length === 0) {
      console.warn(`[MeshProtocol] ⚠️ Ticket not found: ${payload.ticketId}`);
      console.warn(`[MeshProtocol]    Is the event synced on this device?`);
      return;
    }

    const ticket = tickets[0];
    console.log(`[MeshProtocol]    Local ticket status: ${ticket.status}`);

    const existingLogs = await database
      .get<ScanLog>('scan_logs')
      .query(
        Q.where('ticket_id',    payload.ticketId),
        Q.where('is_duplicate', Q.eq(false)),
      )
      .fetch();

    console.log(`[MeshProtocol]    Existing valid scan logs: ${existingLogs.length}`);

    if (existingLogs.length > 0) {
      const ourTime   = existingLogs[0].scanned_at;
      const theirTime = payload.scannedAt;
      const diffMs    = theirTime - ourTime;

      console.log(`[MeshProtocol]    Our scan:   ${new Date(ourTime).toISOString()}`);
      console.log(`[MeshProtocol]    Peer scan:  ${new Date(theirTime).toISOString()}`);
      console.log(`[MeshProtocol]    Diff:       ${diffMs > 0 ? '+' : ''}${diffMs}ms (${diffMs > 0 ? 'peer later' : 'peer earlier'})`);

      if (ourTime <= theirTime) {
        console.log(`[MeshProtocol] ⚖️ WE won (scanned first) — ignoring peer scan`);
        return;
      }
      console.log(`[MeshProtocol] ⚖️ PEER won (scanned first) — updating our record`);
    }

    if (ticket.status !== 'used') {
      await ticket.update((t: Ticket) => { t.status = 'used'; });
      console.log(`[MeshProtocol] ✅ Ticket marked used: ${payload.ticketId}`);
    } else {
      console.log(`[MeshProtocol] ℹ️ Ticket already used — status unchanged`);
    }

    if (existingLogs.length === 0) {
      await database.get<ScanLog>('scan_logs').create((log: ScanLog) => {
        log.ticket_id    = payload.ticketId;
        log.event_id     = payload.eventId;
        log.device_id    = payload.deviceId;
        log.gate_number  = payload.gateNumber;
        log.device_name  = payload.deviceName;
        log.scanned_at   = payload.scannedAt;
        log.uploaded     = false;
        log.is_duplicate = false;
      });
      console.log(`[MeshProtocol] 📝 Scan log created from peer data`);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  MARK OUTBOX DELIVERED
// ─────────────────────────────────────────────────────────────────────────────
async function markOutboxDelivered(ticketId: string, eventId: string): Promise<void> {
  console.log(`[MeshProtocol] 📬 markOutboxDelivered: ${ticketId}`);

  const entries = await database.get<MeshOutbox>('mesh_outbox')
    .query(
      Q.where('ticket_id', ticketId),
      Q.where('event_id',  eventId),
      Q.where('delivered', Q.eq(false)),
    )
    .fetch();

  console.log(`[MeshProtocol]    Matching undelivered entries: ${entries.length}`);

  if (entries.length === 0) {
    console.warn(`[MeshProtocol] ⚠️ No outbox entry to mark delivered for ${ticketId}`);
    console.warn(`[MeshProtocol]    Possible reasons: already delivered, or entry never created`);
    return;
  }

  await database.write(async () => {
    for (const entry of entries) {
      await entry.update((e: any) => { e.delivered = true; });
    }
  });

  console.log(`[MeshProtocol] ✅ Outbox marked delivered: ${ticketId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  BROADCAST WRAPPER
// ─────────────────────────────────────────────────────────────────────────────
async function broadcastMessage(message: MeshMessage, label = ''): Promise<void> {
  const tag  = label || message.type;
  // Stamp a unique msgId so Nearby never sees identical byte sequences.
  // Same JSON content = same bytes = silently dropped by Nearby content dedup.
  const stamped = { ...message, msgId: makeMsgId(message.type) };
  const json = JSON.stringify(stamped);

  console.log(`[MeshProtocol] 📡 broadcast [${tag}] — ${json.length} bytes`);

  try {
    const result = await nearbyBroadcast(stamped);
    if (result) {
      console.log(`[MeshProtocol] ✅ broadcast [${tag}] SUCCESS`);
    } else {
      console.warn(`[MeshProtocol] ⚠️ broadcast [${tag}] returned false`);
      console.warn(`[MeshProtocol]    → No connected peers OR native send failed`);
    }
  } catch (e: any) {
    console.error(`[MeshProtocol] ❌ broadcast [${tag}] THREW: ${e?.message ?? e}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────
export function getPeerRTT(deviceId: string): number | null {
  return rttMap.get(deviceId) ?? null;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}