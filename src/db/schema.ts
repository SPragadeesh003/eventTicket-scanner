import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [

    // ── Tickets (synced from Supabase per event) ──────────────
    tableSchema({
      name: 'tickets',
      columns: [
        { name: 'ticket_id',   type: 'string', isIndexed: true },
        { name: 'event_id',    type: 'string', isIndexed: true },
        { name: 'name',        type: 'string', isIndexed: true },
        { name: 'ticket_type', type: 'string', isIndexed: true }, // regular | guest_list | external
        { name: 'status',      type: 'string', isIndexed: true }, // valid | used
        { name: 'synced_at',   type: 'number' },                  // epoch ms — when pulled from Supabase
      ],
    }),

    // ── Scan Logs (local queue until internet returns) ────────
    tableSchema({
      name: 'scan_logs',
      columns: [
        { name: 'ticket_id',   type: 'string', isIndexed: true },
        { name: 'event_id',    type: 'string', isIndexed: true },
        { name: 'device_id',   type: 'string' },
        { name: 'gate_number', type: 'number' },
        { name: 'device_name', type: 'string' },
        { name: 'scanned_at',  type: 'number' },  // epoch ms
        { name: 'uploaded',    type: 'boolean', isIndexed: true }, // false = pending upload
        { name: 'is_duplicate', type: 'boolean' },
      ],
    }),

    // ── Synced Events (track which events are downloaded) ─────
    tableSchema({
      name: 'synced_events',
      columns: [
        { name: 'event_id',        type: 'string', isIndexed: true },
        { name: 'event_name',      type: 'string' },
        { name: 'total_tickets',   type: 'number' },
        { name: 'last_synced_at',  type: 'number' },  // epoch ms
      ],
    }),

  ],
});