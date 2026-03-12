import { database }  from '@/src/db/database';
import { supabase }   from '@/src/lib/supabase';
import { Q }          from '@nozbe/watermelondb';
import type { Ticket, ScanLog, SyncedEvent } from '@/src/db/models';

const BATCH_SIZE = 1000;

// ─── Types ────────────────────────────────────────────────────
export interface SyncProgress {
  downloaded: number;
  total:      number;
  percent:    number;
}

export interface EventStats {
  totalTickets:          number;
  regularCount:          number;
  guestListCount:        number;
  externalCount:         number;
  regularScannedCount:   number;
  guestListScannedCount: number;
  externalScannedCount:  number;
  totalScanned:          number;
  scannedByDevice:       number;
  lastSyncedAt:          number | null;
}

// ─── Check if event is already synced locally ─────────────────
export async function isEventSynced(eventId: string): Promise<boolean> {
  try {
    const results = await database
      .get<SyncedEvent>('synced_events')
      .query(Q.where('event_id', eventId))
      .fetch();
    return results.length > 0;
  } catch {
    return false;
  }
}

// ─── Get last sync time ───────────────────────────────────────
export async function getLastSyncTime(eventId: string): Promise<number | null> {
  try {
    const results = await database
      .get<SyncedEvent>('synced_events')
      .query(Q.where('event_id', eventId))
      .fetch();
    return results.length > 0 ? results[0].last_synced_at : null;
  } catch {
    return null;
  }
}

// ─── Sync tickets Supabase → WatermelonDB ────────────────────
export async function syncEventTickets(
  eventId:    string,
  eventName:  string,
  onProgress: (p: SyncProgress) => void,
): Promise<void> {

  // 1. Get total count
  const { count, error: countError } = await supabase
    .from('tickets')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId);

  if (countError) throw new Error(countError.message);

  const total = count ?? 0;
  if (total === 0) throw new Error('No tickets found for this event.');

  // 2. Clear existing local tickets for this event
  const ticketsCol = database.get<Ticket>('tickets');
  
  await database.write(async () => {
    await ticketsCol.query(Q.where('event_id', eventId)).destroyAllPermanently();
  });

  // 3. Fetch pages and insert into WatermelonDB
  let downloaded = 0;
  let from       = 0;
  const now      = Date.now();

  while (from < total) {
    const { data, error } = await supabase
      .from('tickets')
      .select('ticket_id, name, ticket_type, status')
      .eq('event_id', eventId)
      .range(from, from + BATCH_SIZE - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    await database.write(async () => {
      const creations = data.map(row =>
        ticketsCol.prepareCreate((t: Ticket) => {
          t._setRaw('ticket_id',   row.ticket_id);
          t._setRaw('event_id',    eventId);
          t._setRaw('name',        row.name);
          t._setRaw('ticket_type', row.ticket_type);
          t._setRaw('status',      row.status);
          t._setRaw('synced_at',   now);
        })
      );
      
      // Batch in chunks of 500 to avoid stack limits
      for (let i = 0; i < creations.length; i += 500) {
        await database.batch(...creations.slice(i, i + 500));
      }
    });

    downloaded += data.length;
    from       += BATCH_SIZE;

    onProgress({
      downloaded,
      total,
      percent: Math.min(100, Math.round((downloaded / total) * 100)),
    });
  }

  // 4. Save or update sync record
  const syncedCol    = database.get<SyncedEvent>('synced_events');
  const existingSync = await syncedCol.query(Q.where('event_id', eventId)).fetch();

  await database.write(async () => {
    if (existingSync.length > 0) {
      await existingSync[0].update((s: SyncedEvent) => {
        s._setRaw('last_synced_at', now);
        s._setRaw('total_tickets',  total);
      });
    } else {
      await syncedCol.create((s: SyncedEvent) => {
        s._setRaw('event_id',       eventId);
        s._setRaw('event_name',     eventName);
        s._setRaw('total_tickets',  total);
        s._setRaw('last_synced_at', now);
      });
    }
  });
}

// ─── Get stats from local WatermelonDB ───────────────────────
export async function getLocalEventStats(
  eventId:  string,
  deviceId: string,
): Promise<EventStats> {
  try {
    const ticketsCol  = database.get<Ticket>('tickets');
    const scanLogsCol = database.get<ScanLog>('scan_logs');

    const [
      totalTickets,
      regularCount,
      guestListCount,
      externalCount,
      totalScanned,
      regularScanned,
      guestListScanned,
      externalScanned,
      deviceScans,
      lastSyncedAt,
    ] = await Promise.all([
      ticketsCol.query(Q.where('event_id', eventId)).fetchCount(),
      ticketsCol.query(Q.where('event_id', eventId), Q.where('ticket_type', 'regular')).fetchCount(),
      ticketsCol.query(Q.where('event_id', eventId), Q.where('ticket_type', 'guest_list')).fetchCount(),
      ticketsCol.query(Q.where('event_id', eventId), Q.where('ticket_type', 'external')).fetchCount(),
      ticketsCol.query(Q.where('event_id', eventId), Q.where('status', 'used')).fetchCount(),
      ticketsCol.query(Q.where('event_id', eventId), Q.where('ticket_type', 'regular'), Q.where('status', 'used')).fetchCount(),
      ticketsCol.query(Q.where('event_id', eventId), Q.where('ticket_type', 'guest_list'), Q.where('status', 'used')).fetchCount(),
      ticketsCol.query(Q.where('event_id', eventId), Q.where('ticket_type', 'external'), Q.where('status', 'used')).fetchCount(),
      scanLogsCol.query(Q.where('event_id', eventId), Q.where('device_id', deviceId)).fetchCount(),
      getLastSyncTime(eventId),
    ]);

    return {
      totalTickets,
      regularCount,
      guestListCount,
      externalCount,
      totalScanned,
      regularScannedCount:   regularScanned,
      guestListScannedCount: guestListScanned,
      externalScannedCount:  externalScanned,
      scannedByDevice:       deviceScans,
      lastSyncedAt,
    };
  } catch {
    return {
      totalTickets:          0,
      regularCount:          0,
      guestListCount:        0,
      externalCount:         0,
      regularScannedCount:   0,
      guestListScannedCount: 0,
      externalScannedCount:  0,
      totalScanned:          0,
      scannedByDevice:       0,
      lastSyncedAt:          null,
    };
  }
}

// ─── Format last sync time ────────────────────────────────────
export function formatLastSync(epochMs: number | null): string {
  if (!epochMs) return 'Never';
  const secs = Math.floor((Date.now() - epochMs) / 1000);
  if (secs < 10)  return 'Just now';
  if (secs < 60)  return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}