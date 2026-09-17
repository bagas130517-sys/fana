import { Hono, type Context } from "hono";
import type Redis from "ioredis";
import { desc, eq } from "drizzle-orm";
import { apiKeys, getDb, plans, users } from "@fana/db";
import { firstIssue, planInputSchema, planLimitsSchema, planSlugSchema } from "@fana/core";
import {
  createKey,
  createPlan,
  deletePlan,
  listPlans,
  updatePlan,
} from "../keys/keys.js";
import { monthlyUsage, usageHistory } from "../keys/usage.js";
import { currentSession } from "../auth/middleware.js";

/** The user a new key belongs to: the one named, else the caller. */
async function resolveOwner(c: Context, publicId?: string): Promise<number | null> {
  const db = getDb();
  if (publicId) {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.publicId, publicId))
      .limit(1);
    return row?.id ?? null;
  }
  const session = currentSession(c);
  return session?.userId ?? null;
}

/**
 * Issuing customer keys and editing the plans behind them. Admin-only; the
 * customer-facing side of these keys is /v1.
 */
export function keyRoutes(redis: Redis) {
  const routes = new Hono();

  /** GET /api/admin/plans */
  routes.get("/admin/plans", async (c) => {
    const rows = await listPlans();
    return c.json({
      plans: rows.map((p) => ({
        slug: p.slug,
        label: p.label,
        monthlyRequests: p.monthlyRequests,
        requestsPerMinute: p.requestsPerMinute,
        retentionMinutes: p.retentionMinutes,
        concurrentInboxes: p.concurrentInboxes,
      })),
    });
  });

  /** POST /api/admin/plans — add a plan (paid tiers start here). */
  routes.post("/admin/plans", async (c) => {
    const parsed = planInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: firstIssue(parsed.error) }, 400);

    const existing = await listPlans();
    if (existing.some((p) => p.slug === parsed.data.slug)) {
      return c.json({ error: `Plan "${parsed.data.slug}" already exists` }, 409);
    }
    const row = await createPlan(parsed.data);
    return c.json({ plan: row?.slug }, 201);
  });

  /** PUT /api/admin/plans/:slug — change limits. Takes effect on the next request. */
  routes.put("/admin/plans/:slug", async (c) => {
    const slug = planSlugSchema.safeParse(c.req.param("slug"));
    if (!slug.success) return c.json({ error: firstIssue(slug.error) }, 400);

    const body = await c.req.json().catch(() => null);
    const limits = planLimitsSchema.partial().safeParse(body ?? {});
    if (!limits.success) return c.json({ error: firstIssue(limits.error) }, 400);

    const label = typeof (body as { label?: unknown })?.label === "string"
      ? { label: (body as { label: string }).label.trim() }
      : {};

    const row = await updatePlan(slug.data, { ...limits.data, ...label });
    return row ? c.json({ ok: true }) : c.json({ error: "Plan not found" }, 404);
  });

  /** DELETE /api/admin/plans/:slug — only when no key is on it. */
  routes.delete("/admin/plans/:slug", async (c) => {
    const result = await deletePlan(c.req.param("slug"));
    if (result.inUse) {
      return c.json(
        { error: `${result.inUse} account(s) are on this plan — move them first` },
        400,
      );
    }
    return result.ok ? c.json({ ok: true }) : c.json({ error: "Plan not found" }, 404);
  });

  /** GET /api/admin/keys — every issued key, with owner and this month's usage. */
  routes.get("/admin/keys", async (c) => {
    const rows = await getDb()
      .select({ key: apiKeys, plan: plans, owner: users })
      .from(apiKeys)
      .innerJoin(users, eq(apiKeys.userId, users.id))
      .innerJoin(plans, eq(users.planId, plans.id))
      .orderBy(desc(apiKeys.createdAt));

    return c.json({
      keys: await Promise.all(
        rows.map(async ({ key, plan, owner }) => ({
          id: key.publicId,
          label: key.label,
          owner: owner.username,
          email: owner.email,
          prefix: key.prefix,
          plan: plan.slug,
          ownerId: owner.publicId,
          monthlyRequests: plan.monthlyRequests,
          usage: await monthlyUsage(redis, key.id),
          createdAt: key.createdAt.toISOString(),
          lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
        })),
      ),
    });
  });

  /**
   * POST /api/admin/keys { label, plan, user? } — issue on someone's behalf.
   * Without `user` the key belongs to the operator making the call, which is
   * how you get one for your own testing.
   */
  routes.post("/admin/keys", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      label?: string;
      plan?: string;
      user?: string;
    } | null;

    const label = body?.label?.trim();
    if (!label) return c.json({ error: "A label is required" }, 400);

    const owner = await resolveOwner(c, body?.user);
    if (!owner) return c.json({ error: "Owner not found" }, 404);

    // No plan here: a key inherits the owner's. Move the account instead.
    const result = await createKey({ userId: owner, label });
    if ("error" in result) return c.json({ error: result.error }, 400);

    return c.json(
      {
        key: result.key, // shown once
        id: result.row.publicId,
        prefix: result.row.prefix,
      },
      201,
    );
  });

  /**
   * PUT /api/admin/users/:id { plan } — move an account to another plan.
   * Every key that account holds follows, which is the point: a customer is on
   * one plan, not a different one per key.
   */
  routes.put("/admin/users/:id", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { plan?: string } | null;
    const planSlug = planSlugSchema.safeParse(body?.plan ?? "");
    if (!planSlug.success) return c.json({ error: firstIssue(planSlug.error) }, 400);

    const db = getDb();
    const [plan] = await db.select().from(plans).where(eq(plans.slug, planSlug.data)).limit(1);
    if (!plan) return c.json({ error: "Plan not found" }, 404);

    const [row] = await db
      .update(users)
      .set({ planId: plan.id, updatedAt: new Date() })
      .where(eq(users.publicId, c.req.param("id")))
      .returning({ id: users.id });
    return row ? c.json({ ok: true }) : c.json({ error: "Account not found" }, 404);
  });

  /** DELETE /api/admin/keys/:id — revoke immediately. */
  routes.delete("/admin/keys/:id", async (c) => {
    const [row] = await getDb()
      .delete(apiKeys)
      .where(eq(apiKeys.publicId, c.req.param("id")))
      .returning({ id: apiKeys.id });
    return row ? c.json({ ok: true }) : c.json({ error: "Key not found" }, 404);
  });

  /** GET /api/admin/keys/:id/usage — durable monthly totals. */
  routes.get("/admin/keys/:id/usage", async (c) => {
    const [row] = await getDb()
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(eq(apiKeys.publicId, c.req.param("id")))
      .limit(1);
    if (!row) return c.json({ error: "Key not found" }, 404);
    return c.json({ usage: await usageHistory(row.id) });
  });

  return routes;
}
