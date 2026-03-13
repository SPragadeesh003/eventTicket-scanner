import { Model } from '@nozbe/watermelondb';

export class Ticket extends Model {
  static table = 'tickets';

  get ticket_id(): string { return this._getRaw('ticket_id') as string; }
  get event_id(): string { return this._getRaw('event_id') as string; }
  get name(): string { return this._getRaw('name') as string; }
  get ticket_type(): string { return this._getRaw('ticket_type') as string; }
  get status(): string { return this._getRaw('status') as string; }
  get synced_at(): number { return this._getRaw('synced_at') as number; }

  set status(value: string) { this._setRaw('status', value); }
}

export class ScanLog extends Model {
  static table = 'scan_logs';

  get ticket_id(): string { return this._getRaw('ticket_id') as string; }
  get event_id(): string { return this._getRaw('event_id') as string; }
  get device_id(): string { return this._getRaw('device_id') as string; }
  get gate_number(): number { return this._getRaw('gate_number') as number; }
  get device_name(): string { return this._getRaw('device_name') as string; }
  get scanned_at(): number { return this._getRaw('scanned_at') as number; } // epoch ms
  get uploaded(): boolean { return this._getRaw('uploaded') === true || this._getRaw('uploaded') === 1; }
  get is_duplicate(): boolean { return this._getRaw('is_duplicate') === true || this._getRaw('is_duplicate') === 1; }

  set ticket_id(v: string) { this._setRaw('ticket_id', v); }
  set event_id(v: string) { this._setRaw('event_id', v); }
  set device_id(v: string) { this._setRaw('device_id', v); }
  set gate_number(v: number) { this._setRaw('gate_number', v); }
  set device_name(v: string) { this._setRaw('device_name', v); }
  set scanned_at(v: number) { this._setRaw('scanned_at', v); }
  set uploaded(v: boolean) { this._setRaw('uploaded', v); }
  set is_duplicate(v: boolean) { this._setRaw('is_duplicate', v); }
}

export class SyncedEvent extends Model {
  static table = 'synced_events';

  get event_id(): string { return this._getRaw('event_id') as string; }
  get event_name(): string { return this._getRaw('event_name') as string; }
  get total_tickets(): number { return this._getRaw('total_tickets') as number; }
  get last_synced_at(): number { return this._getRaw('last_synced_at') as number; }

  set event_id(v: string) { this._setRaw('event_id', v); }
  set event_name(v: string) { this._setRaw('event_name', v); }
  set total_tickets(v: number) { this._setRaw('total_tickets', v); }
  set last_synced_at(v: number) { this._setRaw('last_synced_at', v); }
}