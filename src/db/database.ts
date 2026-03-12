import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { schema } from './schema';
import { Ticket, ScanLog, SyncedEvent } from './models';
import MeshOutbox from './MeshOutbox';

const adapter = new SQLiteAdapter({
  schema,
  dbName: 'EventHorizonDB',
  jsi: true,
  onSetUpError: (error) => {
    console.error('[WatermelonDB] setup error:', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [Ticket, ScanLog, SyncedEvent, MeshOutbox],
});