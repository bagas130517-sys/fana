import { and, eq, isNotNull } from "drizzle-orm";
import { getDb, messages, webhookDeliveries, webhooks } from "@fana/db";
import type { EventBus } from "../events.js";
import { serializeMessage } from "../serialize.js";

/**
 * Turns arriving mail into delivery rows.
 *
 * A second consumer of the one event bus, alongside the WebSocket fan-out and
 * the long-polls. It runs in the API rather than in SMTP on purpose: the sender
 * is blocked until `handleMessage` returns, and an HTTP request to somebody
 * else's server has no business on that path.
 *
 * The event is only a wake-up — the message is re-read from the database, so
 * the decision about who owns it never depends on a payload that crossed a
 * pub/sub channel.
 */

/** Public mail has no owner, so there is nobody to notify. `/v1` only. */
export function startWebhookQueue(bus: EventBus): () => void {
  const off = bus.onAny((event) => {
    if (event.type !== "message:new" || !event.private) return;
    void enqueueForMessage(event.message.id).catch((err: unknown) =>
      console.error("[webhooks] enqueue failed:", err),
    );
  });
  return off;
}

export async function enqueueForMessage(publicId: string): Promise<number> {
  const db = getDb();

  const [row] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.publicId, publicId), isNotNull(messages.ownerUserId)))
    .limit(1);
  if (!row?.ownerUserId) return 0;

  const endpoints = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.userId, row.ownerUserId), eq(webhooks.enabled, true)));
  if (endpoints.length === 0) return 0;

  // Snapshotted now, not read at delivery time: the message may be purged
  // before a retry succeeds, and a retry that can no longer say what arrived is
  // not a retry.
  const payload = {
    event: "message.received" as const,
    message: await serializeMessage(row),
  };

  const inserted = await db
    .insert(webhookDeliveries)
    .values(
      endpoints.map((hook) => ({
        webhookId: hook.id,
        messageId: row.id,
        event: payload.event,
        payload,
      })),
    )
    // Every API node sees the same event and every one of them tries. The
    // unique index makes all but the first a no-op instead of a duplicate POST.
    .onConflictDoNothing()
    .returning({ id: webhookDeliveries.id });

  return inserted.length;
}
