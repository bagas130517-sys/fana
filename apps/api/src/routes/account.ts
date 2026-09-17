import { Hono } from "hono";
import type Redis from "ioredis";
import { and, desc, eq } from "drizzle-orm";
import { apiKeys, getDb, plans, users } from "@fana/db";
import { normalizeAddress } from "@fana/core";
import { currentSession } from "../auth/middleware.js";
import { heldInboxes, releaseInbox } from "../inboxes.js";
import { pageParams } from "../pagination.js";
import { createKey } from "../keys/keys.js";
import { accountUsage, monthlyUsage } from "../keys/usage.js";

/**
 * What a signed-in customer can do for themselves: see their plan, manage their
 * own keys, read their usage. Everything here is scoped to the caller's user id
 * — an operator gets no extra reach through these routes, they use /admin.
 */
export function accountRoutes(redis: Redis) {
  const routes = new Hono();

  // Sessions only: the instance API token belongs to the operator, not to any
  // customer, so "my keys" would be meaningless for it.
  routes.use("*", async (c, next) => {
    if (!currentSession(c)) {
      return c.json({ error: "Sign in to manage your account" }, 403);
    }
    await next();
  });

  /** GET /api/account — who you are and what plan your keys are on. */
  routes.get("/", async (c) => {
    const session = currentSession(c)!;
    const [user] = await getDb()
      .select()
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    if (!user) return c.json({ error: "Account no longer exists" }, 404);

    return c.json({
      user: {
        id: user.publicId,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      },
    });
  });

  /** GET /api/account/keys — your keys, with this month's usage. */
  routes.get("/keys", async (c) => {
    const session = currentSession(c)!;
    // One plan per account, so it's read once rather than joined per key.
    const [owner] = await getDb()
      .select({ plan: plans })
      .from(users)
      .innerJoin(plans, eq(users.planId, plans.id))
      .where(eq(users.id, session.userId))
      .limit(1);
    if (!owner) return c.json({ error: "Account no longer exists" }, 404);
    const plan = owner.plan;

    const rows = await getDb()
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.userId, session.userId))
      .orderBy(desc(apiKeys.createdAt));

    return c.json({
      // The plan is the account's, quoted once — a per-key copy is what made
      // "your plan" ambiguous when an account held more than one key.
      plan: {
        slug: plan.slug,
        label: plan.label,
        monthlyRequests: plan.monthlyRequests,
        requestsPerMinute: plan.requestsPerMinute,
        retentionMinutes: plan.retentionMinutes,
      },
      usage: await accountUsage(redis, session.userId),
      keys: await Promise.all(
        rows.map(async (key) => ({
          id: key.publicId,
          label: key.label,
          prefix: key.prefix,
          usage: await monthlyUsage(redis, key.id),
          createdAt: key.createdAt.toISOString(),
          lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
        })),
      ),
    });
  });

  /**
   * POST /api/account/keys { label } — create one of your own.
   * The plan isn't a parameter: you get what you're entitled to, which today
   * means the default plan and later whatever billing has put you on.
   */
  routes.post("/keys", async (c) => {
    const session = currentSession(c)!;
    const body = (await c.req.json().catch(() => null)) as { label?: string } | null;
    const label = body?.label?.trim() || "Default";

    const owned = await getDb()
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(eq(apiKeys.userId, session.userId));
    if (owned.length >= 10) {
      return c.json({ error: "You already have 10 keys — revoke one first" }, 400);
    }

    const result = await createKey({ userId: session.userId, label });
    if ("error" in result) return c.json({ error: result.error }, 400);

    return c.json(
      { key: result.key, id: result.row.publicId, prefix: result.row.prefix },
      201,
    );
  });

  /**
   * GET /api/account/inboxes — the inboxes you're holding, and how many you may.
   *
   * The same answer `/v1/inboxes` gives a key, reached with a session instead:
   * `concurrentInboxes` is enforced when minting, so a customer who hits it needs
   * somewhere to see what they're holding and let one go.
   */
  routes.get("/inboxes", async (c) => {
    const session = currentSession(c)!;
    const [owner] = await getDb()
      .select({ concurrentInboxes: plans.concurrentInboxes })
      .from(users)
      .innerJoin(plans, eq(users.planId, plans.id))
      .where(eq(users.id, session.userId))
      .limit(1);
    if (!owner) return c.json({ error: "Account no longer exists" }, 404);

    const { rows, ...meta } = await heldInboxes(session.userId, pageParams(c.req.query()));
    return c.json({ inboxes: rows, ...meta, limit: owner.concurrentInboxes });
  });

  /** DELETE /api/account/inboxes/:address — release one, freeing a slot. */
  routes.delete("/inboxes/:address", async (c) => {
    const session = currentSession(c)!;
    const address = normalizeAddress(c.req.param("address"));
    const result = await releaseInbox(session.userId, address);
    // Scoped to the owner, so releasing somebody else's inbox is a 404 rather
    // than a hint that it exists.
    if (!result) return c.json({ error: "Not one of your inboxes" }, 404);
    return c.json({ ok: true, deleted: result.deleted });
  });

  /** DELETE /api/account/keys/:id — revoke one of yours. */
  routes.delete("/keys/:id", async (c) => {
    const session = currentSession(c)!;
    const [row] = await getDb()
      .delete(apiKeys)
      .where(
        and(
          eq(apiKeys.publicId, c.req.param("id")),
          // Scoped to the owner, so guessing another key's id achieves nothing.
          eq(apiKeys.userId, session.userId),
        ),
      )
      .returning({ id: apiKeys.id });
    return row ? c.json({ ok: true }) : c.json({ error: "Key not found" }, 404);
  });

  return routes;
}
