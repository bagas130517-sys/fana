import { and, count, desc, eq } from "drizzle-orm";
import { getDb, webhookDeliveries, webhooks, type WebhookRow } from "@fana/db";
import { checkWebhookUrl } from "@fana/core";
import { randomToken } from "../secrets.js";
import { postToEndpoint } from "./deliver.js";
import { paged, type PageParams, type Paged } from "../pagination.js";

/**
 * A customer's webhook endpoints. Owned by the account, never by a key: a
 * message records `owner_user_id` and nothing else, so the account is the only
 * thing the dispatcher can resolve — and an endpoint tied to a key would stop
 * delivering the moment that key was rotated, for inboxes still alive.
 *
 * One module for both surfaces, like `inboxes.ts`: `/v1/webhooks` with a key
 * and `/api/account/webhooks` with a session must not drift apart.
 */

/** Endpoints one account may register. A ceiling, not a plan feature. */
const MAX_PER_ACCOUNT = 10;

/** Local development points webhooks at this machine; production must not. */
const allowPrivate = () => process.env.WEBHOOK_ALLOW_PRIVATE === "true";

export interface PublicWebhook {
  id: string;
  url: string;
  label: string;
  /** The receiver needs it to verify, so it is readable rather than write-only. */
  secret: string;
  enabled: boolean;
  failures: number;
  lastError: string | null;
  lastDeliveryAt: string | null;
  createdAt: string;
}

export const toPublic = (row: WebhookRow): PublicWebhook => ({
  id: row.publicId,
  url: row.url,
  label: row.label,
  secret: row.secret,
  enabled: row.enabled,
  failures: row.failures,
  lastError: row.lastError,
  lastDeliveryAt: row.lastDeliveryAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

export async function listWebhooks(userId: number): Promise<PublicWebhook[]> {
  const rows = await getDb()
    .select()
    .from(webhooks)
    .where(eq(webhooks.userId, userId))
    .orderBy(desc(webhooks.createdAt));
  return rows.map(toPublic);
}

export async function createWebhook(
  userId: number,
  input: { url?: string; label?: string },
): Promise<{ webhook: PublicWebhook } | { error: string }> {
  const check = checkWebhookUrl(input.url ?? "", allowPrivate());
  if (!check.ok) return { error: check.reason };

  const db = getDb();
  const owned = await db
    .select({ id: webhooks.id })
    .from(webhooks)
    .where(eq(webhooks.userId, userId));
  if (owned.length >= MAX_PER_ACCOUNT) {
    return { error: `You already have ${MAX_PER_ACCOUNT} endpoints — remove one first` };
  }

  const [row] = await db
    .insert(webhooks)
    .values({
      userId,
      url: check.url,
      label: input.label?.trim().slice(0, 64) ?? "",
      secret: `whsec_${randomToken(24)}`,
    })
    .returning();
  return row ? { webhook: toPublic(row) } : { error: "Could not save the endpoint" };
}

/**
 * Re-enable an endpoint the deliverer switched off, and clear the failure count
 * so it gets a clean run rather than tripping again on the next mistake.
 */
export async function updateWebhook(
  userId: number,
  publicId: string,
  input: { enabled?: boolean; label?: string },
): Promise<PublicWebhook | null> {
  const patch: Partial<WebhookRow> = { updatedAt: new Date() };
  if (typeof input.enabled === "boolean") {
    patch.enabled = input.enabled;
    if (input.enabled) {
      patch.failures = 0;
      patch.lastError = null;
    }
  }
  if (typeof input.label === "string") patch.label = input.label.trim().slice(0, 64);

  const [row] = await getDb()
    .update(webhooks)
    .set(patch)
    .where(and(eq(webhooks.publicId, publicId), eq(webhooks.userId, userId)))
    .returning();
  return row ? toPublic(row) : null;
}

export async function deleteWebhook(userId: number, publicId: string): Promise<boolean> {
  const [row] = await getDb()
    .delete(webhooks)
    .where(and(eq(webhooks.publicId, publicId), eq(webhooks.userId, userId)))
    .returning({ id: webhooks.id });
  return Boolean(row);
}

/**
 * Send a sample event, now, and report what the endpoint said.
 *
 * Not queued and not recorded: the point is an answer while the customer is
 * looking at the screen, and a test is not a message — `webhook_deliveries`
 * requires one. It leaves the endpoint's failure count alone for the same
 * reason: a diagnostic that disables the thing being diagnosed is a trap.
 */
export async function testWebhook(
  userId: number,
  publicId: string,
): Promise<{ ok: boolean; status?: number; error?: string } | null> {
  const [hook] = await getDb()
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.publicId, publicId), eq(webhooks.userId, userId)))
    .limit(1);
  if (!hook) return null;

  // Shaped like the real thing so a receiver can parse it the same way, and
  // named so it can be told apart from one.
  const payload = {
    event: "webhook.test" as const,
    sentAt: new Date().toISOString(),
    message: {
      id: "00000000-0000-0000-0000-000000000000",
      mailbox: "sample@example.com",
      fromAddress: "noreply@example.org",
      fromName: "Example",
      subject: "Test delivery",
      text: "Your verification code is 123456.",
      html: null,
      receivedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      seen: false,
      auth: { spf: "pass", dkim: "pass", dmarc: "pass", verdict: "verified" },
      attachments: [],
      extracted: { codes: ["123456"], links: [] },
    },
  };

  const result = await postToEndpoint(hook, payload.event, payload, `test_${hook.publicId}`);
  return result.ok
    ? { ok: true, status: result.status }
    : { ok: false, status: result.status, error: result.error };
}

export interface PublicDelivery {
  id: string;
  event: string;
  status: string;
  attempts: number;
  lastStatus: number | null;
  lastError: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

/** Recent attempts for one endpoint — the answer to "why didn't it arrive?". */
export async function listDeliveries(
  userId: number,
  publicId: string,
  page: PageParams,
): Promise<Paged<PublicDelivery> | null> {
  const db = getDb();
  const [hook] = await db
    .select({ id: webhooks.id })
    .from(webhooks)
    .where(and(eq(webhooks.publicId, publicId), eq(webhooks.userId, userId)))
    .limit(1);
  if (!hook) return null;

  const [totals] = await db
    .select({ n: count() })
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, hook.id));
  const rows = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, hook.id))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(page.perPage)
    .offset(page.offset);

  const list = rows.map((d) => ({
    id: d.publicId,
    event: d.event,
    status: d.status,
    attempts: d.attempts,
    lastStatus: d.lastStatus,
    lastError: d.lastError,
    nextAttemptAt: d.status === "pending" ? d.nextAttemptAt.toISOString() : null,
    deliveredAt: d.deliveredAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
  }));
  return paged(list, totals?.n ?? 0, page);
}
