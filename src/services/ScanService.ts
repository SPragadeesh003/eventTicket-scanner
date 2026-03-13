import { database } from '@/src/db/database';
import { Q } from '@nozbe/watermelondb';
import type { Ticket, ScanLog } from '@/src/db/models';
import { sendScan } from '@/src/services/MeshProtocol';
import { getProfile } from '@/src/services/ProfileService';
import type { ScanPayload } from '@/src/services/MeshProtocol';

// ─── Types ────────────────────────────────────────────────────────────────────
export type ScanResult =
  | { status: 'valid'; name: string; ticketType: string; ticketId: string }
  | { status: 'duplicate'; name: string; ticketType: string; ticketId: string }
  | { status: 'invalid'; name: string; ticketType: string; ticketId: string };

// ─── Validate & process a scanned ticket ─────────────────────────────────────
export async function validateTicket(
  ticketId: string,
  eventId: string,
  deviceId: string,
  deviceName?: string,
  gateNumber?: number,
): Promise<ScanResult> {
  // Guard: if caller forgot to pass deviceName, fall back to cached profile.
  // This prevents 'from: undefined' in mesh payloads.
  const profile = await getProfile();
  const resolvedDeviceName = deviceName || profile?.meshName || 'Unknown-Gate';
  const resolvedGateNumber = gateNumber ?? profile?.scannerNumber ?? 1;
  const ticketsCol = database.get<Ticket>('tickets');

  // ── 1. Look up ticket ────────────────────────────────────────────────────
  const matches = await ticketsCol
    .query(Q.where('event_id', eventId), Q.where('ticket_id', ticketId))
    .fetch();

  // ── INVALID: ticket not found ────────────────────────────────────────────
  // ✅ Do NOT create any scan_log for invalid scans.
  // Invalid means the QR code is not in this event — nothing to record.
  if (matches.length === 0) {
    console.log(`[Validate] ❌ INVALID — ticket not found: ${ticketId}`);
    return {
      status: 'invalid',
      name: 'Unknown',
      ticketType: 'N/A',
      ticketId: ticketId || '#INVALID',
    };
  }

  const ticket = matches[0];

  // ── DUPLICATE: already used ───────────────────────────────────────────────
  // ✅ Do NOT create another scan_log row for duplicates.
  // The original valid scan log already exists — creating another row
  // inflates the "scanned by device" count displayed in the UI.
  if (ticket.status === 'used') {
    console.log(`[Validate] ⚠️ DUPLICATE — already used: ${ticketId}`);
    return {
      status: 'duplicate',
      name: ticket.name,
      ticketType: ticket.ticket_type,
      ticketId: ticket.ticket_id,
    };
  }

  // ── VALID: first scan ─────────────────────────────────────────────────────
  const scannedAt = Date.now();

  await database.write(async () => {
    // Mark ticket used
    await ticket.update((t: Ticket) => {
      t.status = 'used';
    });

    // Create exactly ONE scan log — only for valid first scans
    await database.get<ScanLog>('scan_logs').create((log: ScanLog) => {
      log.ticket_id = ticket.ticket_id;
      log.event_id = eventId;
      log.device_id = deviceId;
      log.gate_number = resolvedGateNumber;
      log.device_name = resolvedDeviceName;
      log.scanned_at = scannedAt;
      log.uploaded = false;
      log.is_duplicate = false;
    });
  });

  console.log(`[Validate] ✅ VALID — ${ticket.name} (${ticketId}) — broadcasting to mesh`);

  // ── Broadcast via MeshProtocol (store → forward → ACK) ───────────────────
  // ✅ Goes through outbox so it survives if peers aren't connected yet.
  // Fire-and-forget — UI already shows result.
  const payload: ScanPayload = {
    ticketId: ticket.ticket_id,
    eventId,
    deviceId,
    deviceName: resolvedDeviceName,
    gateNumber: resolvedGateNumber,
    scannedAt,
  };

  sendScan(payload).catch(e =>
    console.warn('[Validate] sendScan failed:', e)
  );

  return {
    status: 'valid',
    name: ticket.name,
    ticketType: ticket.ticket_type,
    ticketId: ticket.ticket_id,
  };
}