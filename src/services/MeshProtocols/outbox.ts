import { database } from '@/src/db/database';
import { Q } from '@nozbe/watermelondb';
import MeshOutbox from '@/src/db/MeshOutbox';
import {
  FLUSH_COOLDOWN_MS,
  FLUSH_DELAY_WIFI,
  FLUSH_DELAY_BLE
} from './constants';
import {
  flushInProgress,
  setFlushInProgress,
  lastFlushAt,
  setLastFlushAt,
  activeTransportIsBLE,
  _registry
} from './state';
import { ScanPayload } from './types';

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function markOutboxDelivered(ticketId: string, eventId: string): Promise<void> {
  console.log(`[MeshProtocol] 📬 markOutboxDelivered: ${ticketId}`);

  const entries = await database.get<MeshOutbox>('mesh_outbox')
    .query(
      Q.where('ticket_id', ticketId),
      Q.where('event_id', eventId),
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

export async function flushOutbox(
  bypassCooldown = false
): Promise<void> {
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

  setFlushInProgress(true);
  setLastFlushAt(now);

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
    const transport = activeTransportIsBLE ? '📶 BLE' : '📡 WiFi Direct';
    console.log(`[MeshProtocol] 📦 Transport: ${transport} — inter-payload delay: ${sendDelayMs}ms`);

    const sentEntries: MeshOutbox[] = [];

    for (const entry of undelivered) {
      console.log(`[MeshProtocol]    ↳ retry #${entry.retry_count + 1} — ${entry.ticket_id}`);

      const payload: ScanPayload = {
        ticketId: entry.ticket_id,
        eventId: entry.event_id,
        deviceId: entry.device_id,
        deviceName: entry.device_name,
        gateNumber: entry.gate_number,
        scannedAt: entry.scanned_at,
      };

      const retrySent = await _registry.broadcastMessage?.({ type: 'SCAN', payload }, `RETRY:${entry.ticket_id}`);

      if (retrySent) {
        sentEntries.push(entry);
        _registry.continueAckTimeout?.(entry.ticket_id);
      }

      if (sendDelayMs > 0 && entry !== undelivered[undelivered.length - 1]) {
        await delay(sendDelayMs);
      }
    }

    if (sentEntries.length > 0) {
      const ts = Date.now();
      try {
        await database.write(async () => {
          for (const entry of sentEntries) {
            await entry.update((e: any) => {
              e.retry_count = entry.retry_count + 1;
              e.last_tried_at = ts;
            });
          }
        });
      } catch (e) {
        console.error(`[MeshProtocol] ❌ Failed to batch-update retry counts:`, e);
      }
    }

    console.log(`[MeshProtocol] 📦 Flush done — retried ${undelivered.length} entries`);
  } finally {
    setFlushInProgress(false);
  }
}