import { database } from '@/src/db/database';
import { Q }        from '@nozbe/watermelondb';
import type { Ticket, ScanLog } from '@/src/db/models';

// ─── Types ────────────────────────────────────────────────────
export type ScanResult =
  | { status: 'valid';     name: string; ticketType: string; ticketId: string }
  | { status: 'duplicate'; name: string; ticketType: string; ticketId: string }
  | { status: 'invalid';   name: string; ticketType: string; ticketId: string };

// ─── Validate & process a scanned ticket ──────────────────────
export async function validateTicket(
  ticketId: string,
  eventId:  string,
  deviceId: string,
): Promise<ScanResult> {
  const ticketsCol = database.get<Ticket>('tickets');

  // 1. Look up ticket in local DB
  const matches = await ticketsCol
    .query(Q.where('event_id', eventId), Q.where('ticket_id', ticketId))
    .fetch();

  if (matches.length === 0) {
    return {
      status:     'invalid',
      name:       'Unknown',
      ticketType: 'N/A',
      ticketId:   ticketId || '#INVALID',
    };
  }

  const ticket = matches[0];

  // 2. Already used → duplicate
  if (ticket.status === 'used') {
    // Log the duplicate scan as well
    await database.write(async () => {
      await database.get<ScanLog>('scan_logs').create((log: ScanLog) => {
        log.ticket_id   = ticket.ticket_id;
        log.event_id    = eventId;
        log.device_id   = deviceId;
        log.gate_number = 1;      // or context aware
        log.device_name = deviceId;
        log.scanned_at  = Date.now();
        log.uploaded    = false;
        log.is_duplicate = true;
      });
    });

    return {
      status:     'duplicate',
      name:       ticket.name,
      ticketType: ticket.ticket_type,
      ticketId:   ticket.ticket_id,
    };
  }

  // 3. Valid → mark as used + create scan log
  await database.write(async () => {
    await ticket.update((t: Ticket) => {
      t.status = 'used';
    });

    await database.get<ScanLog>('scan_logs').create((log: ScanLog) => {
      log.ticket_id   = ticket.ticket_id;
      log.event_id    = eventId;
      log.device_id   = deviceId;
      log.gate_number = 1;
      log.device_name = deviceId;
      log.scanned_at  = Date.now();
      log.uploaded    = false;
      log.is_duplicate = false;
    });
  });

  return {
    status:     'valid',
    name:       ticket.name,
    ticketType: ticket.ticket_type,
    ticketId:   ticket.ticket_id,
  };
}
