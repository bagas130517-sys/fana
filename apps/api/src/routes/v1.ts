import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import type Redis from "ioredis";
import { and, asc, desc, eq, gt, ilike, sql, type SQL } from "drizzle-orm";
import { getDb, messages, reservations, type MessageRow } from "@fana/db";
import { normalizeAddress, randomAddress, withinLimit } from "@fana/core";
import { deleteMessagesWhere } from "../blobs.js";
import { isServed, isServedAddress, servedList } from "../domains.js";
import { waitFor, type EventBus } from "../events.js";
import { heldCount, heldInboxes, releaseInbox } from "../inboxes.js";
import { serializeMessage, serializeMessages } from "../serialize.js";
import { visibleTo } from "../visibility.js";
import { pageParams } from "../pagination.js";
import { currentKey } from "../keys/middleware.js";
import { accountUsage } from "../keys/usage.js";

/**
 * The customer API. Same mail underneath as the free web surface, but reached
 * with a key: quota, plan-controlled retention, private inboxes, and a stable
 * contract that can be versioned without touching what the website uses.
 */

/** Shortest an API-minted address is held, whatever the plan's retention is. */
const MIN_HOLD_MS = 30 * 60_000;

/** Long-poll ceiling. Past this, proxies and load balancers cut the socket anyway. */
const MAX_WAIT_SECONDS = 120;
const DEFAULT_WAIT_SECONDS = 30;

/** `%` and `_` are wildcards in LIKE — a caller's literal ones must stay literal. */
const likeContains = (value: string) =>
  `%${value.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;

export function v1Routes(redis: Redis, events: EventBus) {
  const routes = new Hono();

  /** GET /v1/me — which key this is, its plan, and what's left of the quota. */
  routes.get("/me", async (c) => {
    const { key, plan } = currentKey(c);
    const used = await accountUsage(redis, key.userId);
    const held = await heldCount(key.userId);
    return c.json({
      key: { id: key.publicId, label: key.label, prefix: key.prefix },
      plan: {
        slug: plan.slug,
        label: plan.label,
        monthlyRequests: plan.monthlyRequests,
        requestsPerMinute: plan.requestsPerMinute,
        retentionMinutes: plan.retentionMinutes,
        concurrentInboxes: plan.concurrentInboxes,
      },
      usage: {
        period: new Date().toISOString().slice(0, 7),
        requests: used,
        // Held across the account, like every other limit — two keys don't buy
        // two allowances.
        inboxes: held,
      },
    });
  });

  /** GET /v1/domains — domains this instance accepts mail for. */
  routes.get("/domains", (c) => c.json({ domains: servedList() }));

  /** GET /v1/inboxes — the inboxes this account is currently holding. */
  routes.get("/inboxes", async (c) => {
    const { key, plan } = currentKey(c);
    const { rows, ...meta } = await heldInboxes(key.userId, pageParams(c.req.query()));
    return c.json({ inboxes: rows, ...meta, limit: plan.concurrentInboxes });
  });

  /**
   * POST /v1/inboxes { domain?, private? } — mint a random address and hold it.
   * Omit the domain and one of the served domains is picked at random.
   *
   * Private by default: paying for an inbox and having it readable by anyone
   * who guesses the address is not what a customer asks for. Pass
   * `private: false` for one that behaves like the website's — shareable, and
   * visible in the public inbox UI.
   */
  routes.post("/inboxes", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      domain?: string;
      private?: boolean;
    } | null;
    const served = servedList();
    const domain = normalizeAddress(
      body?.domain ?? served[Math.floor(Math.random() * served.length)]!,
    );
    if (!isServed(domain)) return c.json({ error: "Unknown domain" }, 400);
    const isPrivate = body?.private !== false;

    const db = getDb();
    const { key, plan } = currentKey(c);
    const now = new Date();

    // The plan's concurrent-inbox ceiling, counted over live reservations for
    // the account. Expired ones cost nothing — the purge job clears them, and
    // the count ignores them either way.
    const held = await heldCount(key.userId);
    if (!withinLimit(held, plan.concurrentInboxes)) {
      return c.json(
        {
          error: "Too many inboxes held at once — release one first",
          limit: plan.concurrentInboxes,
          held,
          plan: plan.slug,
        },
        429,
      );
    }

    const token = randomUUID();
    // Held for as long as the plan keeps mail — once retention has passed there
    // is nothing left to come back for, and a longer hold would only burn a
    // concurrent-inbox slot. RESERVATION_TTL_MINUTES is the browser's number:
    // that client renews its hold, an API caller releases instead. The floor
    // keeps a short-retention plan from expiring the address mid-signup-flow.
    const holdMs = Math.max(MIN_HOLD_MS, plan.retentionMinutes * 60_000);
    const expiresAt = new Date(now.getTime() + holdMs);

    for (let i = 0; i < 6; i++) {
      const address = randomAddress(domain);
      const inserted = await db
        .insert(reservations)
        .values({
          address,
          token,
          keyId: key.id,
          ownerUserId: key.userId,
          isPrivate,
          expiresAt,
        })
        .onConflictDoNothing()
        .returning({ address: reservations.address });
      if (inserted.length > 0) {
        return c.json(
          {
            address,
            domain,
            private: isPrivate,
            // The hold on the address, not the mail — messages live as long as
            // the plan says.
            reservedUntil: expiresAt.toISOString(),
            retentionMinutes: plan.retentionMinutes,
          },
          201,
        );
      }
    }
    return c.json({ error: "Could not allocate an address, try again" }, 503);
  });

  /** GET /v1/inboxes/:address/messages — newest first, unexpired only. */
  routes.get("/inboxes/:address/messages", async (c) => {
    const address = normalizeAddress(c.req.param("address"));
    if (!isServedAddress(address)) return c.json({ error: "Unknown mailbox domain" }, 400);

    const { key } = currentKey(c);
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));
    const rows = await getDb()
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.mailbox, address),
          gt(messages.expiresAt, new Date()),
          visibleTo(key.userId),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    return c.json({ messages: await serializeMessages(rows) });
  });

  /**
   * GET /v1/inboxes/:address/wait — block until a matching message arrives.
   *
   * The call a signup test actually wants: create an inbox, trigger the mail,
   * wait for it. Polling `/messages` in a loop burns quota on empty answers and
   * still adds latency; this returns the moment the message lands.
   *
   * `?from=` and `?subject=` are case-insensitive substring matches, `?since=`
   * an ISO timestamp. Matching mail already in the inbox returns immediately, so
   * a message that arrived between the trigger and the call is never missed.
   * The **oldest** match after `since` wins — pass the previous
   * `receivedAt` back as `since` to walk a conversation forward without
   * skipping anything.
   */
  routes.get("/inboxes/:address/wait", async (c) => {
    const address = normalizeAddress(c.req.param("address"));
    if (!isServedAddress(address)) return c.json({ error: "Unknown mailbox domain" }, 400);

    const { key } = currentKey(c);
    const raw = c.req.query("since");
    const since = raw ? new Date(raw) : null;
    if (since && Number.isNaN(since.getTime())) {
      return c.json({ error: "since must be an ISO 8601 timestamp" }, 400);
    }
    const from = c.req.query("from")?.trim();
    const subject = c.req.query("subject")?.trim();
    const seconds = Math.min(
      MAX_WAIT_SECONDS,
      Math.max(1, Number(c.req.query("timeout") ?? DEFAULT_WAIT_SECONDS) || DEFAULT_WAIT_SECONDS),
    );

    const filters: SQL[] = [eq(messages.mailbox, address), visibleTo(key.userId)];
    // Truncated to match: `receivedAt` is an ISO string and so carries
    // milliseconds, while created_at keeps microseconds. Comparing them raw
    // makes a message newer than its own timestamp, and "pass receivedAt back as
    // since" would hand back the same message forever.
    if (since) {
      filters.push(
        sql`date_trunc('milliseconds', ${messages.createdAt}) > ${since.toISOString()}::timestamptz`,
      );
    }
    if (from) filters.push(ilike(messages.fromAddress, likeContains(from)));
    if (subject) filters.push(ilike(messages.subject, likeContains(subject)));

    const probe = async (): Promise<MessageRow | null> => {
      const [row] = await getDb()
        .select()
        .from(messages)
        .where(and(...filters, gt(messages.expiresAt, new Date())))
        .orderBy(asc(messages.createdAt))
        .limit(1);
      return row ?? null;
    };

    const found = await waitFor(
      events,
      address,
      probe,
      seconds * 1000,
      // A client that hangs up should not hold a listener for two more minutes.
      c.req.raw.signal,
    );
    if (!found) return c.json({ message: null, timedOut: true });

    if (!found.seen) {
      await getDb().update(messages).set({ seen: true }).where(eq(messages.id, found.id));
    }
    return c.json({
      message: { ...(await serializeMessage(found)), seen: true },
      timedOut: false,
    });
  });

  /** DELETE /v1/inboxes/:address — empty an inbox between test runs. */
  routes.delete("/inboxes/:address", async (c) => {
    const address = normalizeAddress(c.req.param("address"));
    if (!isServedAddress(address)) return c.json({ error: "Unknown mailbox domain" }, 400);
    const { key } = currentKey(c);
    const deleted = await deleteMessagesWhere(
      and(eq(messages.mailbox, address), visibleTo(key.userId))!,
    );
    return c.json({ ok: true, deleted });
  });

  /**
   * POST /v1/inboxes/:address/release — give the address back.
   * Emptying an inbox keeps the hold so the address can be reused; releasing
   * drops the hold *and* its mail, which is what frees a concurrent-inbox slot.
   */
  routes.post("/inboxes/:address/release", async (c) => {
    const address = normalizeAddress(c.req.param("address"));
    if (!isServedAddress(address)) return c.json({ error: "Unknown mailbox domain" }, 400);

    const { key } = currentKey(c);
    const result = await releaseInbox(key.userId, address);
    if (!result) return c.json({ error: "Not one of your inboxes" }, 404);
    return c.json({ ok: true, deleted: result.deleted });
  });

  /** GET /v1/messages/:id — one message, marked seen. */
  routes.get("/messages/:id", async (c) => {
    const db = getDb();
    const { key } = currentKey(c);
    const [row] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.publicId, c.req.param("id")), visibleTo(key.userId)))
      .limit(1);
    if (!row) return c.json({ error: "Not found" }, 404);

    if (!row.seen) {
      await db.update(messages).set({ seen: true }).where(eq(messages.id, row.id));
    }
    return c.json({ message: { ...(await serializeMessage(row)), seen: true } });
  });

  /** DELETE /v1/messages/:id */
  routes.delete("/messages/:id", async (c) => {
    const { key } = currentKey(c);
    const deleted = await deleteMessagesWhere(
      and(eq(messages.publicId, c.req.param("id")), visibleTo(key.userId))!,
    );
    return deleted > 0 ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404);
  });

  return routes;
}
