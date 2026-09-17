import { Hono } from "hono";
import Redis from "ioredis";
import { count, desc, eq, gte, lte, sql, sum } from "drizzle-orm";
import {
  getDb,
  messages,
  attachments,
  reservations,
  domains as domainsTable,
} from "@fana/db";
import {
  brandOverridesSchema,
  getMailDomains,
  normalizeAddress,
  parseColor,
  safeAssetUrl,
  type Verdict,
} from "@fana/core";
import {
  clearOverrides,
  getBrand,
  readOverrides,
  writeOverrides,
} from "../branding.js";
import { purgeExpired } from "../purge.js";
import { deleteMessagesWhere } from "../blobs.js";
import { paged, pageParams } from "../pagination.js";
import { refreshDomains } from "../domains.js";
import { DOMAIN_RE, MX_HOST, VERIFY_MODE, verifyAndMark } from "../mx.js";

export const adminRoutes = new Hono();

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const num = (v: string | number | null | undefined) => Number(v ?? 0);

// Keys shared with apps/smtp/src/abuse.ts.
const BLOCKLIST_KEY = "smtp:blocklist";
const SENDERS_KEY = "stats:senders";

// Auth lives in the guard mounted in index.ts (session token or API token), so
// every handler below can assume an authorised caller.

/** GET /api/admin/stats — instance-wide counters. */
adminRoutes.get("/admin/stats", async (c) => {
  const db = getDb();
  const now = new Date();
  const [msg] = await db.select({ n: count() }).from(messages);
  const [att] = await db
    .select({ n: count(), bytes: sum(attachments.size) })
    .from(attachments);
  const [resv] = await db.select({ n: count() }).from(reservations);
  const [expired] = await db
    .select({ n: count() })
    .from(messages)
    .where(lte(messages.expiresAt, now));
  const [mailboxes] = await db
    .select({ n: sql<number>`count(distinct ${messages.mailbox})` })
    .from(messages);
  const [verified] = await db
    .select({ n: count() })
    .from(domainsTable)
    .where(eq(domainsTable.verified, true));
  const [pending] = await db
    .select({ n: count() })
    .from(domainsTable)
    .where(eq(domainsTable.verified, false));

  // Extra colour for the overview: how trustworthy inbound mail looks, how much
  // arrived today, and which mailboxes are actually busy.
  const verdictRows = await db
    .select({ verdict: messages.verdict, n: count() })
    .from(messages)
    .groupBy(messages.verdict);
  const [unseen] = await db
    .select({ n: count() })
    .from(messages)
    .where(eq(messages.seen, false));
  const [recent] = await db
    .select({ n: count() })
    .from(messages)
    .where(gte(messages.createdAt, new Date(now.getTime() - 24 * 3_600_000)));
  const topMailboxes = await db
    .select({ mailbox: messages.mailbox, n: count() })
    .from(messages)
    .groupBy(messages.mailbox)
    .orderBy(desc(count()))
    .limit(5);

  const verdicts = { verified: 0, unverified: 0, suspicious: 0 };
  for (const row of verdictRows) {
    if (row.verdict in verdicts) {
      verdicts[row.verdict as keyof typeof verdicts] = num(row.n);
    }
  }

  return c.json({
    messages: num(msg?.n),
    attachments: num(att?.n),
    storageBytes: num(att?.bytes),
    reservations: num(resv?.n),
    activeMailboxes: num(mailboxes?.n),
    expiredPending: num(expired?.n),
    unseen: num(unseen?.n),
    last24h: num(recent?.n),
    verdicts,
    topMailboxes: topMailboxes.map((m) => ({ mailbox: m.mailbox, count: num(m.n) })),
    domains: {
      builtin: getMailDomains().length,
      communityVerified: num(verified?.n),
      communityPending: num(pending?.n),
    },
  });
});

/** GET /api/admin/activity — messages received per hour for the last 24h. */
adminRoutes.get("/admin/activity", async (c) => {
  const now = Date.now();
  const keys: string[] = [];
  for (let i = 23; i >= 0; i--) {
    keys.push(new Date(now - i * 3_600_000).toISOString().slice(0, 13)); // YYYY-MM-DDTHH
  }
  const values = await redis.mget(...keys.map((k) => `stats:rcv:${k}`));
  return c.json({
    activity: keys.map((k, i) => ({ hour: `${k}:00Z`, count: num(values[i]) })),
  });
});

/**
 * GET /api/admin/messages?mailbox=&limit= — recent messages for inspection.
 *
 * The one read path that isn't filtered by ownership: an operator holds the
 * database, so hiding rows here would buy nothing. It stays metadata-only —
 * private mail is flagged rather than opened.
 */
adminRoutes.get("/admin/messages", async (c) => {
  const db = getDb();
  const mailbox = c.req.query("mailbox")?.trim().toLowerCase();
  const page = pageParams(c.req.query());
  const where = mailbox ? eq(messages.mailbox, mailbox) : undefined;
  const [totals] = await db.select({ n: count() }).from(messages).where(where);
  const rows = await db
    .select({
      id: messages.publicId,
      mailbox: messages.mailbox,
      fromAddress: messages.fromAddress,
      fromName: messages.fromName,
      subject: messages.subject,
      verdict: messages.verdict,
      seen: messages.seen,
      ownerUserId: messages.ownerUserId,
      receivedAt: messages.createdAt,
    })
    .from(messages)
    .where(where)
    .orderBy(desc(messages.createdAt))
    .limit(page.perPage)
    .offset(page.offset);

  const list = rows.map(({ ownerUserId, ...r }) => ({
    ...r,
    verdict: r.verdict as Verdict,
    // Whose it is stays internal; that it belongs to somebody is the useful bit.
    private: ownerUserId !== null,
    receivedAt: r.receivedAt.toISOString(),
  }));
  const { rows: _rows, ...meta } = paged(list, totals?.n ?? 0, page);
  return c.json({ messages: list, ...meta });
});

/** GET /api/admin/abuse — top sender IPs + the block list. */
adminRoutes.get("/admin/abuse", async (c) => {
  const flat = await redis.zrevrange(SENDERS_KEY, 0, 19, "WITHSCORES");
  const topSenders: { ip: string; count: number }[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    topSenders.push({ ip: flat[i]!, count: num(flat[i + 1]) });
  }
  const blocked = await redis.smembers(BLOCKLIST_KEY);
  return c.json({ topSenders, blocked });
});

/** POST /api/admin/block { ip } — block an inbound sender IP. */
adminRoutes.post("/admin/block", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { ip?: string } | null;
  const ip = body?.ip?.trim();
  if (!ip) return c.json({ error: "ip required" }, 400);
  await redis.sadd(BLOCKLIST_KEY, ip);
  return c.json({ ok: true });
});

/** DELETE /api/admin/block/:ip — unblock an IP. */
adminRoutes.delete("/admin/block/:ip", async (c) => {
  await redis.srem(BLOCKLIST_KEY, c.req.param("ip"));
  return c.json({ ok: true });
});

/** POST /api/admin/domains { domain } — add a community domain from admin. */
adminRoutes.post("/admin/domains", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { domain?: string } | null;
  const domain = body?.domain?.trim().toLowerCase();
  if (!domain || !DOMAIN_RE.test(domain)) {
    return c.json({ error: "Invalid domain" }, 400);
  }
  await getDb().insert(domainsTable).values({ domain }).onConflictDoNothing();
  const verified = await verifyAndMark(domain);
  return c.json({ domain, verified });
});

/** GET /api/admin/domains — built-in + community domains. */
adminRoutes.get("/admin/domains", async (c) => {
  const page = pageParams(c.req.query());
  const [totals] = await getDb().select({ n: count() }).from(domainsTable);
  const rows = await getDb()
    .select()
    .from(domainsTable)
    .orderBy(domainsTable.createdAt)
    .limit(page.perPage)
    .offset(page.offset);
  const community = rows.map((r) => ({
    domain: r.domain,
    verified: r.verified,
    createdAt: r.createdAt.toISOString(),
    verifiedAt: r.verifiedAt?.toISOString() ?? null,
  }));
  const { rows: _rows, ...meta } = paged(community, totals?.n ?? 0, page);
  return c.json({
    builtin: getMailDomains(),
    community,
    ...meta,
  });
});

/** POST /api/admin/domains/:domain/verify — force an MX re-check. */
adminRoutes.post("/admin/domains/:domain/verify", async (c) => {
  const domain = c.req.param("domain").trim().toLowerCase();
  if (!DOMAIN_RE.test(domain)) return c.json({ error: "Invalid domain" }, 400);
  const verified = await verifyAndMark(domain);
  return c.json({ domain, verified });
});

/** DELETE /api/admin/domains/:domain — revoke a community domain. */
adminRoutes.delete("/admin/domains/:domain", async (c) => {
  const domain = c.req.param("domain").trim().toLowerCase();
  await getDb().delete(domainsTable).where(eq(domainsTable.domain, domain));
  await refreshDomains();
  return c.json({ ok: true });
});

/** DELETE /api/admin/mailbox/:address — purge one mailbox. */
adminRoutes.delete("/admin/mailbox/:address", async (c) => {
  const address = normalizeAddress(c.req.param("address"));
  const deleted = await deleteMessagesWhere(eq(messages.mailbox, address));
  return c.json({ ok: true, deleted });
});

/** POST /api/admin/purge-expired — force a purge sweep now. */
adminRoutes.post("/admin/purge-expired", async (c) => {
  const deleted = await purgeExpired();
  return c.json({ ok: true, deleted });
});

/**
 * POST /api/admin/purge-all — delete every message on the instance.
 * Guarded by an explicit confirmation in the body so a stray curl can't do it.
 */
adminRoutes.post("/admin/purge-all", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { confirm?: string } | null;
  if (body?.confirm !== "purge-all") {
    return c.json({ error: 'Send {"confirm":"purge-all"} to proceed' }, 400);
  }
  // Goes through deleteMessagesWhere so object-storage blobs are cleaned up too.
  const deleted = await deleteMessagesWhere(sql`true`);
  return c.json({ ok: true, deleted });
});

/** POST /api/admin/release-reservations — drop expired address reservations. */
adminRoutes.post("/admin/release-reservations", async (c) => {
  const released = await getDb()
    .delete(reservations)
    .where(lte(reservations.expiresAt, new Date()))
    .returning({ id: reservations.id });
  return c.json({ ok: true, released: released.length });
});

/** POST /api/admin/recheck-domains — re-run MX verification for every community domain. */
adminRoutes.post("/admin/recheck-domains", async (c) => {
  const rows = await getDb().select({ domain: domainsTable.domain }).from(domainsTable);
  const results = await Promise.all(
    rows.map(async (r) => ({ domain: r.domain, verified: await verifyAndMark(r.domain) })),
  );
  await refreshDomains();
  return c.json({
    ok: true,
    checked: results.length,
    verified: results.filter((r) => r.verified).length,
    results,
  });
});

/**
 * POST /api/admin/reset-rate-limits — clear the per-IP counters.
 * For when a shared office IP or a misbehaving proxy has locked out real users.
 */
adminRoutes.post("/admin/reset-rate-limits", async (c) => {
  let cleared = 0;
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "ratelimit:*", "COUNT", 200);
    cursor = next;
    if (keys.length > 0) cleared += await redis.del(...keys);
  } while (cursor !== "0");

  // Failed-login counters are part of the same "let me back in" action.
  cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "login:fail:*", "COUNT", 200);
    cursor = next;
    if (keys.length > 0) cleared += await redis.del(...keys);
  } while (cursor !== "0");

  return c.json({ ok: true, cleared });
});

/** GET /api/admin/branding — saved overrides + the brand they resolve to. */
adminRoutes.get("/admin/branding", async (c) =>
  c.json({ overrides: await readOverrides(), brand: await getBrand() }),
);

/** PUT /api/admin/branding — save overrides. Blank fields inherit the default. */
adminRoutes.put("/admin/branding", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = brandOverridesSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid branding" }, 400);
  }
  // Colours and URLs are validated here so the dashboard can report a typo
  // instead of storing junk that silently renders as the default.
  for (const key of ["accent", "accentDark"] as const) {
    const value = parsed.data[key]?.trim();
    if (value && !parseColor(value)) {
      return c.json({ error: `${key}: use #hex or oklch(L C H)` }, 400);
    }
  }
  for (const key of ["logoUrl", "faviconUrl"] as const) {
    const value = parsed.data[key]?.trim();
    if (value && !safeAssetUrl(value)) {
      return c.json({ error: `${key}: use an https:// URL or a /path` }, 400);
    }
  }
  const overrides = await writeOverrides(parsed.data);
  return c.json({ overrides, brand: await getBrand() });
});

/** DELETE /api/admin/branding — back to the built-in theme. */
adminRoutes.delete("/admin/branding", async (c) => {
  await clearOverrides();
  return c.json({ overrides: {}, brand: await getBrand() });
});

/** GET /api/admin/config — read-only view of the instance configuration. */
adminRoutes.get("/admin/config", (c) => {
  const env = process.env;
  return c.json({
    mailDomains: getMailDomains(),
    messageTtlMinutes: num(env.MESSAGE_TTL_MINUTES ?? 60),
    reservationTtlMinutes: num(env.RESERVATION_TTL_MINUTES ?? 1440),
    storageDriver: env.STORAGE_DRIVER ?? "db",
    domainVerify: VERIFY_MODE,
    mxHost: MX_HOST || null,
    rateLimit: {
      max: num(env.RATE_LIMIT_MAX ?? 60),
      windowSeconds: num(env.RATE_LIMIT_WINDOW_SECONDS ?? 60),
    },
    smtpRateLimit: {
      max: num(env.SMTP_RATE_LIMIT_MAX ?? 30),
      windowSeconds: num(env.SMTP_RATE_LIMIT_WINDOW_SECONDS ?? 60),
    },
  });
});

/** GET /api/admin/health — datastore reachability. */
adminRoutes.get("/admin/health", async (c) => {
  let db = true;
  let redisUp = true;
  try {
    await getDb().execute(sql`select 1`);
  } catch {
    db = false;
  }
  try {
    await redis.ping();
  } catch {
    redisUp = false;
  }
  return c.json({ db, redis: redisUp });
});
