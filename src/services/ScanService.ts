import { database } from '@/src/db/database';
import { Q } from '@nozbe/watermelondb';
import type { Ticket, ScanLog } from '@/src/db/models';
import { getProfile } from '@/src/services/ProfileService';
import { sendScan, type ScanPayload } from '@/src/services/MeshProtocols';

export type ScanResult =
  | { status: 'valid'; name: string; ticketType: string; ticketId: string }
  | { status: 'duplicate'; name: string; ticketType: string; ticketId: string }
  | { status: 'invalid'; name: string; ticketType: string; ticketId: string };

export async function validateTicket(
  ticketId: string,
  eventId: string,
  deviceId: string,
  deviceName?: string,
  gateNumber?: number,
): Promise<ScanResult> {
  const profile = await getProfile();
  const resolvedDeviceName = deviceName || profile?.meshName || 'Unknown-Gate';
  const resolvedGateNumber = gateNumber ?? profile?.scannerNumber ?? 1;
  const ticketsCol = database.get<Ticket>('tickets');

  const matches = await ticketsCol
    .query(Q.where('event_id', eventId), Q.where('ticket_id', ticketId))
    .fetch();

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
  if (ticket.status === 'used') {
    console.log(`[Validate] ⚠️ DUPLICATE — already used: ${ticketId}`);
    return {
      status: 'duplicate',
      name: ticket.name,
      ticketType: ticket.ticket_type,
      ticketId: ticket.ticket_id,
    };
  }
  const scannedAt = Date.now();

  await database.write(async () => {
    await ticket.update((t: Ticket) => {
      t.status = 'used';
    });
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