import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class MeshOutbox extends Model {
  static table = 'mesh_outbox';

  @field('ticket_id')     ticket_id!:     string;
  @field('event_id')      event_id!:      string;
  @field('device_id')     device_id!:     string;
  @field('device_name')   device_name!:   string;
  @field('gate_number')   gate_number!:   number;
  @field('scanned_at')    scanned_at!:    number;
  @field('delivered')     delivered!:     boolean;
  @field('retry_count')   retry_count!:   number;
  @field('last_tried_at') last_tried_at!: number;
  @field('created_at')    created_at!:    number;
}