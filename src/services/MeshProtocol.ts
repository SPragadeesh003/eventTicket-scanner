/**
 * MeshProtocol.ts — Store → Forward → Acknowledge
 *
 * Message types:
 *   SCAN     — ticket scanned, must be ACKed
 *   ACK      — confirm SCAN received and applied
 *   CATCHUP  — request undelivered outbox on connect
 *   PING     — connectivity check with timestamp
 *   PONG     — response to PING
 *
 * Transport awareness:
 *   Nearby Connections automatically negotiates the best available transport:
 *     1. WiFi Direct (P2P, no router needed, works fully offline) — RTT ~50-300ms
 *     2. BLE fallback — RTT ~500ms-3s, lower throughput, more congestion with 5-6 devices
 *
 *   This module infers the active transport from PONG RTT and adjusts ACK
 *   timeout thresholds dynamically:
 *     - WiFi Direct → tight timeouts (fast channel, low retry risk)
 *     - BLE         → relaxed timeouts (slow channel, avoid flooding the queue)
 *
 * ACK retry strategy (per transport):
 *   WiFi Direct: 4s → retry, 6s → retry, 10s → force reconnect  (~20s total)
 *   BLE:         8s → retry, 12s → retry, 20s → force reconnect  (~40s total)
 *
 * Flush cooldown:
 *   flushOutbox() is guarded by a 5s cooldown + in-progress flag to prevent
 *   interleaved ACK timeouts from flooding the send queue.
 *
 *   IMPORTANT: onPeerConnected() bypasses the cooldown via flushOutbox(true).
 *   A newly connected peer always deserves an immediate flush regardless of
 *   when the last flush ran — that was for a different connection or a
 *   different session. Skipping it causes delivered=false entries to sit
 *   in the outbox until the next cooldown window expires.
 */

import { database } from '@/src/db/database';
import { Q }        from '@nozbe/watermelondb';
import { nearbyBroadcast, nearbyGetDevices } from '@/src/native/NearbyConnections';
import MeshOutbox from '@/src/db/MeshOutbox';
import type { Ticket, ScanLog } from '@/src/db/models';

// ─── Message shapes ───────────────────────────────────────────────────────────
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

// ─── Transport quality detection ──────────────────────────────────────────────
//
// Nearby Connections doesn't expose which transport it picked. We infer it from
// PONG RTT:
//   < 400ms  → WiFi Direct (fast, P2P, works offline without a router)
//   >= 400ms → BLE or degraded link
//
// WiFi Direct works fully offline — devices connect peer-to-peer without any
// router or internet. At venue: keep WiFi ON on all devices even if no network.
//
const RTT_WIFI_THRESHOLD_MS = 400;

// WiFi Direct: tight — channel is fast, false positives unlikely
const ACK_TIMEOUT_WIFI  = 4_000;
const ACK_BACKOFF_WIFI  = [6_000, 10_000];   // ~20s total before reconnect

// BLE: relaxed — queue is slow, flooding it makes ghost SUCCESSes worse
const ACK_TIMEOUT_BLE   = 8_000;
const ACK_BACKOFF_BLE   = [12_000, 20_000];  // ~40s total before reconnect

// Inter-payload delay in flushOutbox — BLE needs more breathing room
const FLUSH_DELAY_WIFI  = 300;
const FLUSH_DELAY_BLE   = 600;

// Assume WiFi Direct until first PONG proves otherwise
let activeTransportIsBLE = false;

function getAckTimeoutMs(): number {
  return activeTransportIsBLE ? ACK_TIMEOUT_BLE : ACK_TIMEOUT_WIFI;
}

function getAckBackoffMs(): number[] {
  return activeTransportIsBLE ? ACK_BACKOFF_BLE : ACK_BACKOFF_WIFI;
}

const ACK_MAX_RETRIES = 1; // 1 retry, then force reconnect — heartbeat catches dead channels faster

// ─── RTT tracking ─────────────────────────────────────────────────────────────
const pendingPings = new Map<string, number>();
const rttMap       = new Map<string, number>();

// ─── ACK timeout tracking ─────────────────────────────────────────────────────
// ticketId → { handle, retryCount }
const pendingAcks = new Map<string, { handle: ReturnType<typeof setTimeout>; retryCount: number }>();

// ─── Heartbeat ───────────────────────────────────────────────────────────────
//
// Periodic PING sent to all peers every HEARTBEAT_INTERVAL_MS.
// If no PONG arrives within PONG_TIMEOUT_MS, the WiFi Direct P2P group has
// silently died — force reconnect immediately.
//
// This catches the "ghost SUCCESS" case: nearbyBroadcast returns true (send
// queue accepted) but bytes never flow because the underlying socket is dead.
// Without heartbeat, this is only detected after ACK retries exhaust (~20s).
// With heartbeat, detection happens within PONG_TIMEOUT_MS (~6s worst case).
//
const HEARTBEAT_INTERVAL_MS = 4_000;  // ping every 4s
const PONG_TIMEOUT_MS_WIFI  = 3_000;  // 3s to reply on WiFi Direct
const PONG_TIMEOUT_MS_BLE   = 6_000;  // 6s to reply on BLE

let heartbeatTimer:    ReturnType<typeof setInterval>  | null = null;
let pongTimeoutTimer:  ReturnType<typeof setTimeout>   | null = null;
let heartbeatDeviceId: string = '';   // localDeviceId set on first connect
let lastPongReceivedAt: number = 0;   // timestamp of last PONG/PING received
let peerDeviceIdForHeartbeat: string = ''; // peer we are monitoring
let heartbeatRoleAssigned: boolean = false; // true once applyHeartbeatRole has run
let heartbeatIsSender:    boolean = false;  // current role

// Track when WE sent each PING so RTT is based on our clock, not peer clock.
// Key: msgId of PING we sent. Value: Date.now() when we sent it.
const pingSentAt = new Map<string, number>();

function startHeartbeat(localDeviceId: string, peerDeviceId: string): void {
  stopHeartbeat();
  heartbeatDeviceId  = localDeviceId;
  lastPongReceivedAt = Date.now();

  // Role assignment requires real android-... deviceIds on both sides.
  // If peerDeviceId looks like a device name (Gate-X-XXXX) rather than an
  // android UUID, defer role assignment until first PONG arrives with the
  // real peer deviceId. In the meantime run a passive watchdog only.
  const peerIsRealId = peerDeviceId.startsWith('android-');

  if (!peerIsRealId) {
    // Passive watchdog only — role assigned on first PONG
    heartbeatTimer = setInterval(() => {
      const elapsed = Date.now() - lastPongReceivedAt;
      if (elapsed > HEARTBEAT_INTERVAL_MS * 2.5) {
        console.warn(`[MeshProtocol] 💔 No PING/PONG in ${elapsed}ms — forcing reconnect`);
        stopHeartbeat();
        if (_forceReconnect) {
          _forceReconnect().catch(e => console.error('[MeshProtocol] forceReconnect from watchdog:', e));
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
    console.log(`[MeshProtocol] 💓 Heartbeat pending role assignment (peer: ${peerDeviceId})`);
    return;
  }

  applyHeartbeatRole(localDeviceId, peerDeviceId);
}

function applyHeartbeatRole(localDeviceId: string, peerDeviceId: string): void {
  const iAmSender = localDeviceId < peerDeviceId;

  // Idempotent: if role is already assigned for this peer, don't restart the
  // interval — this prevents orphaned setIntervals from multiple PONG deliveries
  // calling applyHeartbeatRole before dedup catches them.
  if (heartbeatRoleAssigned && heartbeatIsSender === iAmSender && peerDeviceIdForHeartbeat === peerDeviceId) {
    return;
  }

  // Clear any existing timer before assigning new role
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  heartbeatRoleAssigned = true;
  heartbeatIsSender     = iAmSender;

  if (iAmSender) {
    heartbeatTimer = setInterval(() => {
      sendHeartbeatPing();
    }, HEARTBEAT_INTERVAL_MS);
    console.log(`[MeshProtocol] 💓 Heartbeat SENDER (my ...${localDeviceId.slice(-4)} < peer ...${peerDeviceId.slice(-4)})`);
  } else {
    // Responder: watch for absence of PINGs (sender alive signal)
    heartbeatTimer = setInterval(() => {
      const elapsed = Date.now() - lastPongReceivedAt;
      if (elapsed > HEARTBEAT_INTERVAL_MS * 2.5) {
        console.warn(`[MeshProtocol] 💔 No PING in ${elapsed}ms — sender died — forcing reconnect`);
        stopHeartbeat();
        if (_forceReconnect) {
          _forceReconnect().catch(e => console.error('[MeshProtocol] forceReconnect from PING watchdog:', e));
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
    console.log(`[MeshProtocol] 💓 Heartbeat RESPONDER (my ...${localDeviceId.slice(-4)} > peer ...${peerDeviceId.slice(-4)})`);
  }
}

function stopHeartbeat(): void {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  clearPongTimeout();
  heartbeatRoleAssigned     = false;
  heartbeatIsSender         = false;
  peerDeviceIdForHeartbeat  = '';
  heartbeatDeviceId         = '';
  console.log('[MeshProtocol] 💓 Heartbeat stopped');
}

function clearPongTimeout(): void {
  if (pongTimeoutTimer !== null) {
    clearTimeout(pongTimeoutTimer);
    pongTimeoutTimer = null;
  }
}

async function sendHeartbeatPing(): Promise<void> {
  const pingTs  = Date.now();
  const msgId   = `PING-${pingTs}-${Math.random().toString(36).slice(2, 7)}`;

  // Record our local sendTs keyed by msgId so RTT can be measured accurately
  // using our own clock when the PONG arrives (avoids peer clock skew).
  pingSentAt.set(msgId, pingTs);
  // Keep map bounded — remove entries older than 30s
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

  // Arm PONG timeout — if PONG doesn't arrive, channel is dead
  clearPongTimeout();
  const timeoutMs = activeTransportIsBLE ? PONG_TIMEOUT_MS_BLE : PONG_TIMEOUT_MS_WIFI;
  pongTimeoutTimer = setTimeout(async () => {
    pongTimeoutTimer = null;
    console.warn(`[MeshProtocol] 💔 PONG timeout after ${timeoutMs}ms — WiFi Direct group silently died — forcing reconnect`);
    stopHeartbeat();
    if (_forceReconnect) {
      try { await _forceReconnect(); }
      catch (e) { console.error('[MeshProtocol] forceReconnect from PONG timeout error:', e); }
    }
  }, timeoutMs);
}

export function clearHeartbeat(): void {
  stopHeartbeat();
}

// ─── Message deduplication ───────────────────────────────────────────────────
//
// Nearby Connections occasionally delivers the same payload twice at the Java
// layer (duplicate onPayloadReceived callbacks for the same payloadId).
// We deduplicate by msgId — every message carries a unique msgId stamp.
// Cache is capped at 200 entries with a 30s TTL to stay memory-bounded.
//
const seenMsgIds = new Map<string, number>(); // msgId → receivedAt timestamp
const SEEN_MSG_TTL_MS = 30_000;
const SEEN_MSG_MAX    = 200;

function isDuplicate(msgId: string | undefined): boolean {
  if (!msgId) return false;
  const now = Date.now();

  // Evict expired entries
  if (seenMsgIds.size >= SEEN_MSG_MAX) {
    for (const [id, ts] of seenMsgIds) {
      if (now - ts > SEEN_MSG_TTL_MS) seenMsgIds.delete(id);
    }
  }

  if (seenMsgIds.has(msgId)) return true;
  seenMsgIds.set(msgId, now);
  return false;
}

// ─── Force reconnect injection ────────────────────────────────────────────────
// Injected by NearbyConnectionServices to avoid circular import
let _forceReconnect: (() => Promise<void>) | null = null;

export function setForceReconnect(fn: () => Promise<void>): void {
  _forceReconnect = fn;
}

/**
 * Clear ALL pending ACK timers and reset flush state.
 * Must be called by forceReconnect() before teardown so zombie timers from the
 * old session don't fire against the new connection.
 */
export function clearAllAckTimeouts(): void {
  for (const [ticketId, entry] of pendingAcks) {
    clearTimeout(entry.handle);
    console.log(`[MeshProtocol] 🧹 Cleared stale ACK timeout: ${ticketId}`);
  }
  pendingAcks.clear();
  flushInProgress = false;
  lastFlushAt     = 0;
  stopHeartbeat();
  console.log('[MeshProtocol] 🧹 All ACK timeouts cleared — clean slate for new session');
}

function startAckTimeout(ticketId: string, retryCount = 0): void {
  clearAckTimeout(ticketId);

  const backoffs  = getAckBackoffMs();
  const timeoutMs = retryCount === 0
    ? getAckTimeoutMs()
    : (backoffs[retryCount - 1] ?? backoffs[backoffs.length - 1]);

  const transport = activeTransportIsBLE ? '📶 BLE' : '📡 WiFi Direct';

  const handle = setTimeout(async () => {
    pendingAcks.delete(ticketId);

    if (retryCount >= ACK_MAX_RETRIES) {
      // Retries exhausted — check if peers are still connected
      let peerCount = 0;
      try {
        const devices = await nearbyGetDevices();
        peerCount = devices.length;
      } catch (_) {}

      if (peerCount === 0) {
        // Already disconnected — reconnection manager is handling it
        // Ticket stays in outbox, will flush automatically on next connect
        console.warn(`[MeshProtocol] ⚠️ ACK retries exhausted for ${ticketId} — no peers, skip force reconnect`);
        return;
      }

      // Peers exist but ACKs aren't arriving = truly stale channel
      console.warn(`[MeshProtocol] ❌ ACK FAILED after ${ACK_MAX_RETRIES} retries for ${ticketId} — forcing reconnect`);
      console.warn(`[MeshProtocol]    Transport: ${transport} | Peers still connected: ${peerCount}`);
      if (_forceReconnect) {
        try { await _forceReconnect(); }
        catch (e) { console.error('[MeshProtocol] forceReconnect error:', e); }
      }
      return;
    }

    console.warn(`[MeshProtocol] ⏱️ ACK TIMEOUT for ${ticketId} [${transport}] (attempt ${retryCount + 1}/${ACK_MAX_RETRIES}) — re-flushing outbox`);
    // bypassCooldown=true: ACK timeout means a specific ticket is unacknowledged.
    // The 5s cooldown blocks speculative flushes — but this is a direct retry
    // responding to a missed ACK. A handshake flush that ran <5s ago will silently
    // block this retry without bypass, leaving the ticket undelivered until
    // force reconnect fires (~20s later) instead of just resending immediately.
    await flushOutbox(true);
    startAckTimeout(ticketId, retryCount + 1);

  }, timeoutMs);

  pendingAcks.set(ticketId, { handle, retryCount });
  console.log(`[MeshProtocol] ⏱️ ACK timeout [${transport}] for ${ticketId} — attempt ${retryCount + 1}, ${timeoutMs / 1000}s`);
}

function clearAckTimeout(ticketId: string): void {
  const entry = pendingAcks.get(ticketId);
  if (entry !== undefined) {
    clearTimeout(entry.handle);
    pendingAcks.delete(ticketId);
  }
}

// ─── Callbacks ────────────────────────────────────────────────────────────────
type ProtocolCallbacks = {
  onTicketSyncedFromPeer: (payload: ScanPayload) => void;
  onPeerRTT:              (deviceId: string, rttMs: number) => void;
  onAckReceived:          (ticketId: string, fromDeviceId: string) => void;
  onTransportDetected?:   (isBLE: boolean, rttMs: number) => void;
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
  let hasPeers = false;
  try {
    const devices = await nearbyGetDevices();
    hasPeers = devices.length > 0;
    console.log(`[MeshProtocol] 📡 Connected peers at send time: ${devices.length}`);
    if (!hasPeers) {
      console.warn(`[MeshProtocol] ⚠️ No peers — saved to outbox, will retry on next connect`);
    } else {
      devices.forEach((d, i) =>
        console.log(`[MeshProtocol]    [${i + 1}] ${d.deviceName} (${d.endpointId})`)
      );
    }
  } catch (e) {
    console.warn(`[MeshProtocol] ⚠️ Could not fetch peer list:`, e);
  }

  // 3. Broadcast
  const sent = await broadcastMessage({ type: 'SCAN', payload }, `SCAN:${payload.ticketId}`);

  // 4. Start transport-aware ACK timeout
  if (sent && hasPeers) {
    startAckTimeout(payload.ticketId, 0);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  RECEIVE — handle all incoming messages
// ─────────────────────────────────────────────────────────────────────────────
export async function receiveMessage(
  raw:            string,
  fromEndpointId: string,
  localDeviceId:  string,
): Promise<void> {
  console.log(`[MeshProtocol] ════════════════════════════════`);
  console.log(`[MeshProtocol] 📨 RAW MESSAGE RECEIVED`);
  console.log(`[MeshProtocol]    fromEndpoint: ${fromEndpointId}`);
  console.log(`[MeshProtocol]    length:       ${raw.length} chars`);
  console.log(`[MeshProtocol]    preview:      ${raw.substring(0, 150)}`);

  let message: MeshMessage;
  try {
    message = JSON.parse(raw);
    console.log(`[MeshProtocol] ✅ Parsed OK — type: ${message.type}`);
  } catch (e) {
    console.error(`[MeshProtocol] ❌ JSON PARSE FAILED: ${e}`);
    return;
  }

  // Deduplicate — Nearby sometimes delivers the same payload twice,
  // even from different endpointIds when a P2P group re-forms.
  // Primary key: msgId (always present, stable across all duplicate deliveries).
  // Fallback for PONG without msgId: composite PONG:{fromDeviceId}:{pingTs}.
  const dedupKey = message.msgId
    ?? (message.type === 'PONG' ? `PONG:${(message as any).fromDeviceId}:${(message as any).pingTs}` : undefined);
  if (isDuplicate(dedupKey)) {
    console.log(`[MeshProtocol] 🔁 Duplicate dropped: ${dedupKey} (type: ${message.type})`);
    return;
  }

  switch (message.type) {

    case 'SCAN': {
      const { payload } = message;
      console.log(`[MeshProtocol] 🎫 SCAN — ticketId: ${payload.ticketId} from: ${payload.deviceName}`);

      if (payload.deviceId === localDeviceId) {
        console.log(`[MeshProtocol] 🔁 Own echo — ignoring`);
        return;
      }

      await applyPeerScan(payload);

      // ACK always sent — even for duplicates.
      // ACK = "I received and processed this payload", not "this was new to me".
      // The sender needs the ACK to mark their outbox entry delivered and stop retrying.
      const ackSent = await broadcastMessage({
        type:         'ACK',
        ticketId:     payload.ticketId,
        eventId:      payload.eventId,
        fromDeviceId: localDeviceId,
      }, `ACK:${payload.ticketId}`);

      if (!ackSent) {
        console.warn(`[MeshProtocol] ⚠️ ACK returned false for ${payload.ticketId} — no peers at ACK time`);
      }

      callbacks?.onTicketSyncedFromPeer(payload);
      break;
    }

    case 'ACK': {
      console.log(`[MeshProtocol] ✅ ACK — ticketId: ${message.ticketId} from: ${message.fromDeviceId}`);

      if (message.fromDeviceId === localDeviceId) {
        console.log(`[MeshProtocol] 🔁 Own ACK echo — ignoring`);
        return;
      }

      clearAckTimeout(message.ticketId);
      await markOutboxDelivered(message.ticketId, message.eventId);
      callbacks?.onAckReceived(message.ticketId, message.fromDeviceId);
      break;
    }

    case 'CATCHUP': {
      console.log(`[MeshProtocol] 🔄 CATCHUP request from: ${message.fromDeviceId}`);

      if (message.fromDeviceId === localDeviceId) {
        console.log(`[MeshProtocol] 🔁 Own CATCHUP echo — ignoring`);
        return;
      }

      // CATCHUP from peer: flush immediately (bypass cooldown — this is a peer-initiated request)
      await flushOutbox(true);
      break;
    }

    case 'PING': {
      console.log(`[MeshProtocol] 🏓 PING from: ${message.fromDeviceId}`);
      if (message.fromDeviceId === localDeviceId) return;

      // Update lastPongReceivedAt — responder uses this as "peer is alive" signal
      lastPongReceivedAt = Date.now();

      // Use a stable msgId derived from the PING msgId so that if Nearby
      // delivers the same PING twice, both our PONG replies carry the same
      // msgId and the peer's dedup cache drops the second one.
      const pongMsgId = message.msgId ? `PONG-reply-${message.msgId}` : undefined;
      const pongTs    = Date.now();
      await broadcastMessage({
        type:         'PONG',
        fromDeviceId: localDeviceId,
        pingTs:       message.ts,
        pongTs,
        msgId:        pongMsgId,
      } as any, 'PONG');
      break;
    }

    case 'PONG': {
      if (message.fromDeviceId === localDeviceId) return;

      // PONG received — channel is alive, cancel any pending PONG timeout
      lastPongReceivedAt = Date.now();
      clearPongTimeout();

      // RTT: use our own clock from when we sent the PING (via pingSentAt map)
      // to avoid peer clock skew corrupting the measurement.
      // Fall back to Date.now() - pingTs for handshake PINGs (not in map).
      const sentAt = message.msgId ? pingSentAt.get(message.msgId) : undefined;
      const rtt = sentAt !== undefined ? (Date.now() - sentAt) : Math.abs(Date.now() - message.pingTs);

      // Assign heartbeat role on first PONG (when we have the real peer deviceId)
      if (peerDeviceIdForHeartbeat !== message.fromDeviceId) {
        peerDeviceIdForHeartbeat = message.fromDeviceId;
        if (heartbeatDeviceId && message.fromDeviceId.startsWith('android-')) {
          console.log(`[MeshProtocol] 💓 Assigning heartbeat role — peer deviceId confirmed`);
          applyHeartbeatRole(heartbeatDeviceId, message.fromDeviceId);
        }
      }
      rttMap.set(message.fromDeviceId, rtt);

      // Infer and update transport
      const wasBLE          = activeTransportIsBLE;
      activeTransportIsBLE  = rtt >= RTT_WIFI_THRESHOLD_MS;

      const qualityLabel =
        rtt < 100  ? '🟢 Excellent'      :
        rtt < 400  ? '🟢 WiFi Direct'    :
        rtt < 800  ? '🟡 BLE Good'       :
        rtt < 2000 ? '🟠 BLE Fair'       : '🔴 BLE Poor';

      const transportLabel  = activeTransportIsBLE ? '📶 BLE' : '📡 WiFi Direct';
      const timeoutSummary  = activeTransportIsBLE
        ? `${ACK_TIMEOUT_BLE/1000}s / ${ACK_BACKOFF_BLE.map(b => b/1000+'s').join(' / ')} (~${(ACK_TIMEOUT_BLE + ACK_BACKOFF_BLE.reduce((a,b)=>a+b,0))/1000}s total)`
        : `${ACK_TIMEOUT_WIFI/1000}s / ${ACK_BACKOFF_WIFI.map(b => b/1000+'s').join(' / ')} (~${(ACK_TIMEOUT_WIFI + ACK_BACKOFF_WIFI.reduce((a,b)=>a+b,0))/1000}s total)`;

      console.log(`[MeshProtocol] 📶 PONG from: ${message.fromDeviceId} — RTT: ${rtt}ms (${qualityLabel})`);
      console.log(`[MeshProtocol]    Transport: ${transportLabel} | ACK timeouts: ${timeoutSummary}`);

      if (wasBLE !== activeTransportIsBLE) {
        console.log(`[MeshProtocol] 🔄 Transport upgraded: ${wasBLE ? 'BLE → WiFi Direct ✨' : 'WiFi Direct → BLE ⚠️'}`);
      }

      callbacks?.onPeerRTT(message.fromDeviceId, rtt);
      callbacks?.onTransportDetected?.(activeTransportIsBLE, rtt);

      break;
    }

    default:
      console.warn(`[MeshProtocol] ⚠️ Unknown message type: ${(message as any).type}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ON PEER CONNECT — handshake: CATCHUP + flush outbox + PING
//
//  IMPORTANT: flushOutbox is called with bypassCooldown=true here.
//
//  Reason: the 5s cooldown exists to stop interleaved ACK timeout retries
//  from flooding a congested channel. But onPeerConnected is a NEW connection
//  event — the cooldown from the previous session or a mid-session flush is
//  irrelevant. Skipping the flush here means undelivered outbox entries sit
//  idle until the next ACK timeout retry window, which can be 4-8 seconds.
//
//  Scenario that broke without this fix:
//    1. Force reconnect fires → clearAllAckTimeouts() → lastFlushAt = 0 ✓
//    2. forceReconnect() calls startNearbyService() → peer reconnects in ~2s
//    3. During the 2s teardown, a regular ACK timeout flush fires → lastFlushAt = now
//    4. onPeerConnected fires → flushOutbox() → sees lastFlushAt 1.6s ago → SKIPS
//    5. TP-21993 stays undelivered until the next 5s window
// ─────────────────────────────────────────────────────────────────────────────
export async function onPeerConnected(
  localDeviceId:  string,
  peerDeviceName: string,
): Promise<void> {
  console.log(`[MeshProtocol] 🤝 HANDSHAKE with: ${peerDeviceName}`);

  await broadcastMessage({ type: 'CATCHUP', fromDeviceId: localDeviceId }, 'CATCHUP');

  // bypassCooldown=true: fresh connection always gets an immediate flush
  await flushOutbox(true);

  const pingTs = Date.now();
  pendingPings.set(localDeviceId, pingTs);
  await broadcastMessage({ type: 'PING', fromDeviceId: localDeviceId, ts: pingTs }, 'PING');

  // Start periodic heartbeat — detects silent WiFi Direct group death
  // without waiting for ACK retries to exhaust (~20s).
  // Pass peerDeviceName as proxy for peer ID — actual peer deviceId
  // arrives via PONG, but we need something for role assignment now.
  // We use localDeviceId vs a hash of peerDeviceName for determinism.
  peerDeviceIdForHeartbeat = peerDeviceName; // updated to real deviceId on first PONG
  startHeartbeat(localDeviceId, peerDeviceName);

  console.log(`[MeshProtocol] 🤝 Handshake complete for: ${peerDeviceName}`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  FLUSH OUTBOX
//
//  Guards:
//    flushInProgress     — prevents concurrent flushes
//    FLUSH_COOLDOWN_MS   — minimum gap between ACK-retry flushes
//
//  bypassCooldown=true   — used by onPeerConnected and CATCHUP handler.
//    A new connection always deserves an immediate flush regardless of cooldown.
//    The cooldown exists to throttle retry floods on a degraded channel —
//    it must NOT block the first flush on a fresh channel.
//
//  Both guards are reset by clearAllAckTimeouts() on force reconnect so the
//  new session gets a clean flush on its first onPeerConnected.
//
//  Inter-payload delay scales with transport:
//    WiFi Direct → 300ms (queue drains fast)
//    BLE         → 600ms (queue is slow, needs breathing room)
// ─────────────────────────────────────────────────────────────────────────────
const FLUSH_COOLDOWN_MS = 5_000;
let flushInProgress = false;
let lastFlushAt     = 0;

export async function flushOutbox(bypassCooldown = false): Promise<void> {
  if (flushInProgress) {
    console.log(`[MeshProtocol] ⏭️ Flush already in progress — skipping`);
    return;
  }

  const now = Date.now();
  if (!bypassCooldown && (now - lastFlushAt < FLUSH_COOLDOWN_MS)) {
    const elapsed = now - lastFlushAt;
    console.log(`[MeshProtocol] ⏭️ Flush cooldown — ${elapsed}ms since last flush (min ${FLUSH_COOLDOWN_MS}ms) — skipping`);
    return;
  }

  flushInProgress = true;
  lastFlushAt     = now;

  try {
    const reason = bypassCooldown ? ' [bypass: new connection]' : '';
    console.log(`[MeshProtocol] 📦 FLUSH OUTBOX${reason} — querying undelivered...`);

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

    const sendDelayMs = activeTransportIsBLE ? FLUSH_DELAY_BLE : FLUSH_DELAY_WIFI;
    const transport   = activeTransportIsBLE ? '📶 BLE' : '📡 WiFi Direct';
    console.log(`[MeshProtocol] 📦 Transport: ${transport} — inter-payload delay: ${sendDelayMs}ms`);

    for (const entry of undelivered) {
      console.log(`[MeshProtocol]    ↳ retry #${entry.retry_count + 1} — ${entry.ticket_id}`);

      const payload: ScanPayload = {
        ticketId:   entry.ticket_id,
        eventId:    entry.event_id,
        deviceId:   entry.device_id,
        deviceName: entry.device_name,
        gateNumber: entry.gate_number,
        scannedAt:  entry.scanned_at,
      };

      const retrySent = await broadcastMessage({ type: 'SCAN', payload }, `RETRY:${entry.ticket_id}`);

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

      // Start ACK timeout for this retry — if no ACK arrives, the retry storm
      // will escalate to force reconnect. Without this, retried entries from flush
      // have no watchdog: broadcast reports SUCCESS but ACK never arrives silently.
      if (retrySent) {
        startAckTimeout(entry.ticket_id, 0);
      }

      await delay(sendDelayMs);
    }

    console.log(`[MeshProtocol] 📦 Flush done — retried ${undelivered.length} entries`);
  } finally {
    flushInProgress = false;
  }
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

    if (existingLogs.length > 0) {
      const ourTime   = existingLogs[0].scanned_at;
      const theirTime = payload.scannedAt;
      const diffMs    = theirTime - ourTime;

      console.log(`[MeshProtocol]    Our scan:  ${new Date(ourTime).toISOString()}`);
      console.log(`[MeshProtocol]    Peer scan: ${new Date(theirTime).toISOString()}`);
      console.log(`[MeshProtocol]    Diff:      ${diffMs > 0 ? '+' : ''}${diffMs}ms`);

      if (ourTime <= theirTime) {
        console.log(`[MeshProtocol] ⚖️ WE won (scanned first) — ignoring peer scan`);
        return;
      }
      console.log(`[MeshProtocol] ⚖️ PEER won (scanned first) — updating our record`);
    }

    if (ticket.status !== 'used') {
      await ticket.update((t: Ticket) => { t.status = 'used'; });
      console.log(`[MeshProtocol] ✅ Ticket marked used: ${payload.ticketId}`);
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

  if (entries.length === 0) {
    console.warn(`[MeshProtocol] ⚠️ No outbox entry to mark delivered for ${ticketId}`);
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
async function broadcastMessage(message: MeshMessage, label = ''): Promise<boolean> {
  const tag     = label || message.type;
  // Preserve msgId if already set (e.g. heartbeat PING with tracked msgId);
  // otherwise stamp a fresh one so every outbound message is dedup-able.
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

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────
export function getPeerRTT(deviceId: string): number | null {
  return rttMap.get(deviceId) ?? null;
}

export function getActiveTransport(): 'wifi-direct' | 'ble' {
  return activeTransportIsBLE ? 'ble' : 'wifi-direct';
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}