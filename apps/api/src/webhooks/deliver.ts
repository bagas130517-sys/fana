import { lookup } from "node:dns/promises";
import { and, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import { getDb, webhookDeliveries, webhooks, type WebhookDeliveryRow } from "@fana/db";
import {
  FAILURES_BEFORE_DISABLE,
  MAX_ATTEMPTS,
  backoffMs,
  isPrivateHost,
  signWebhook,
} from "@fana/core";

/**
 * Sends the queued deliveries.
 *
 * Rows are claimed with `FOR UPDATE SKIP LOCKED` so several API nodes can run
 * this loop without any of them sending the same delivery twice, and a row left
 * `sending` by a process that died is picked up again after a grace period
 * rather than sitting there forever.
 */

const BATCH = 20;
const REQUEST_TIMEOUT_MS = 10_000;
/** A `sending` row older than this belonged to a process that went away. */
const STALE_MINUTES = 5;
/** Enough of the response to be useful in the dashboard, not enough to store a page. */
const ERROR_CHARS = 300;

const allowPrivate = () => process.env.WEBHOOK_ALLOW_PRIVATE === "true";

/**
 * Resolve before connecting. `checkWebhookUrl` rejected private *literals* when
 * the endpoint was registered, but a name the customer controls can point
 * anywhere and can be repointed afterwards — so the address is checked again at
 * the moment it would be used.
 */
async function resolvesPublicly(hostname: string): Promise<boolean> {
  if (allowPrivate()) return true;
  try {
    const addresses = await lookup(hostname, { all: true });
    return addresses.length > 0 && addresses.every((a) => !isPrivateHost(a.address));
  } catch {
    return false;
  }
}

/**
 * Claim due work so two API nodes never take the same row.
 *
 * `SELECT … FOR UPDATE SKIP LOCKED` then `UPDATE`, inside one transaction: the
 * lock is held until commit, so a second node's select skips those rows. Built
 * with the query builder rather than as one raw statement — the raw version has
 * to hand-encode its own parameters, which is where two attempts at this went
 * wrong before it ever reached the logic.
 */
async function claim(limit: number): Promise<WebhookDeliveryRow[]> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_MINUTES * 60_000);

  return getDb().transaction(async (tx) => {
    const due = await tx
      .select({ id: webhookDeliveries.id })
      .from(webhookDeliveries)
      .where(
        or(
          and(
            eq(webhookDeliveries.status, "pending"),
            lte(webhookDeliveries.nextAttemptAt, now),
          ),
          // Left behind by a process that died mid-send.
          and(
            eq(webhookDeliveries.status, "sending"),
            lt(webhookDeliveries.updatedAt, staleBefore),
          ),
        ),
      )
      .orderBy(webhookDeliveries.nextAttemptAt)
      .limit(limit)
      .for("update", { skipLocked: true });

    if (due.length === 0) return [];

    return tx
      .update(webhookDeliveries)
      .set({
        status: "sending",
        attempts: sql`${webhookDeliveries.attempts} + 1`,
        updatedAt: new Date(),
      })
      .where(
        inArray(
          webhookDeliveries.id,
          due.map((d) => d.id),
        ),
      )
      .returning();
  });
}

async function settle(
  delivery: WebhookDeliveryRow,
  result: { ok: true; status: number } | { ok: false; status?: number; error: string },
): Promise<void> {
  const db = getDb();

  if (result.ok) {
    await db
      .update(webhookDeliveries)
      .set({
        status: "delivered",
        lastStatus: result.status,
        lastError: null,
        deliveredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(webhookDeliveries.id, delivery.id));
    // A success clears the endpoint's failure streak — the count is about
    // "is this endpoint dead", not "has it ever failed".
    await db
      .update(webhooks)
      .set({ failures: 0, lastError: null, lastDeliveryAt: new Date(), updatedAt: new Date() })
      .where(eq(webhooks.id, delivery.webhookId));
    return;
  }

  const spent = delivery.attempts >= MAX_ATTEMPTS;
  await db
    .update(webhookDeliveries)
    .set({
      status: spent ? "failed" : "pending",
      nextAttemptAt: new Date(Date.now() + backoffMs(delivery.attempts)),
      lastStatus: result.status ?? null,
      lastError: result.error.slice(0, ERROR_CHARS),
      updatedAt: new Date(),
    })
    .where(eq(webhookDeliveries.id, delivery.id));

  // Only a delivery that has run out of attempts counts against the endpoint;
  // otherwise one slow afternoon would disable it several times over.
  if (!spent) return;

  const [hook] = await db
    .update(webhooks)
    .set({
      failures: sql`${webhooks.failures} + 1`,
      lastError: result.error.slice(0, ERROR_CHARS),
      lastDeliveryAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(webhooks.id, delivery.webhookId))
    .returning({ failures: webhooks.failures });

  if ((hook?.failures ?? 0) >= FAILURES_BEFORE_DISABLE) {
    await db
      .update(webhooks)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(webhooks.id, delivery.webhookId));
    console.warn(`[webhooks] disabled endpoint ${delivery.webhookId} after repeated failures`);
  }
}

export type SendResult =
  | { ok: true; status: number }
  | { ok: false; status?: number; error: string };

/**
 * One signed POST to an endpoint.
 *
 * Shared by the queue and by the "send a test" button, so a passing test says
 * something about real deliveries: same signature, same address check, same
 * redirect policy. A test that took a shortcut would prove only that the
 * shortcut works.
 */
export async function postToEndpoint(
  hook: { url: string; secret: string },
  event: string,
  payload: unknown,
  deliveryId: string,
): Promise<SendResult> {
  const body = JSON.stringify(payload);
  const at = Math.floor(Date.now() / 1000);

  let host: string;
  try {
    host = new URL(hook.url).hostname;
  } catch {
    return { ok: false, error: "Endpoint URL is no longer valid" };
  }
  if (!(await resolvesPublicly(host))) {
    return { ok: false, error: "Endpoint does not resolve to a reachable public address" };
  }

  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "fana-webhooks/1",
        "x-fana-event": event,
        "x-fana-delivery": deliveryId,
        "x-fana-signature": signWebhook(hook.secret, body, at),
      },
      body,
      // Never follow a redirect: it is the simplest way around the address
      // check above, and a webhook receiver has no reason to redirect.
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    return res.status >= 200 && res.status < 300
      ? { ok: true, status: res.status }
      : { ok: false, status: res.status, error: `Endpoint answered ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Request failed",
    };
  }
}

async function send(delivery: WebhookDeliveryRow): Promise<void> {
  const [hook] = await getDb()
    .select()
    .from(webhooks)
    .where(eq(webhooks.id, delivery.webhookId))
    .limit(1);
  if (!hook) return; // endpoint deleted mid-flight; the cascade will take the row

  const result = await postToEndpoint(
    hook,
    delivery.event,
    delivery.payload,
    delivery.publicId,
  );
  await settle(delivery, result);
}

/** One pass. Exported so a test or an admin action can run it directly. */
export async function deliverDue(limit = BATCH): Promise<number> {
  const due = await claim(limit);
  await Promise.all(due.map((d) => send(d)));
  return due.length;
}

/** Start the delivery loop. Returns a stop function. */
export function startWebhookDelivery(intervalMs = 5_000): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return; // a slow batch must not overlap the next tick
    running = true;
    deliverDue()
      .catch((err: unknown) => console.error("[webhooks] delivery failed:", err))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
