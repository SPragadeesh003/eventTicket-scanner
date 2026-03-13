import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 2,
  tables: [

    tableSchema({
      name: 'tickets',
      columns: [
        { name: 'ticket_id', type: 'string', isIndexed: true },
        { name: 'event_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string', isIndexed: true },
        { name: 'ticket_type', type: 'string', isIndexed: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'synced_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'scan_logs',
      columns: [
        { name: 'ticket_id', type: 'string', isIndexed: true },
        { name: 'event_id', type: 'string', isIndexed: true },
        { name: 'device_id', type: 'string' },
        { name: 'gate_number', type: 'number' },
        { name: 'device_name', type: 'string' },
        { name: 'scanned_at', type: 'number' },
        { name: 'uploaded', type: 'boolean', isIndexed: true },
        { name: 'is_duplicate', type: 'boolean' },
      ],
    }),

    tableSchema({
      name: 'synced_events',
      columns: [
        { name: 'event_id', type: 'string', isIndexed: true },
        { name: 'event_name', type: 'string' },
        { name: 'total_tickets', type: 'number' },
        { name: 'last_synced_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'mesh_outbox',
      columns: [
        { name: 'ticket_id', type: 'string', isIndexed: true },
        { name: 'event_id', type: 'string', isIndexed: true },
        { name: 'device_id', type: 'string' },
        { name: 'device_name', type: 'string' },
        { name: 'gate_number', type: 'number' },
        { name: 'scanned_at', type: 'number' },
        { name: 'delivered', type: 'boolean', isIndexed: true },
        { name: 'retry_count', type: 'number' },
        { name: 'last_tried_at', type: 'number' },
        { name: 'created_at', type: 'number' },
      ],
    }),

  ],
});