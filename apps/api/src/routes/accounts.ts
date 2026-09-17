import { Hono } from "hono";
import type Redis from "ioredis";
import { count, desc, eq, sql } from "drizzle-orm";
import { apiKeys, getDb, plans, users } from "@fana/db";
import { firstIssue, passwordSchema, usernameSchema } from "@fana/core";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import { defaultPlanId } from "../keys/keys.js";
import { accountUsage } from "../keys/usage.js";
import { revokeAllSessions } from "../auth/sessions.js";
import { currentSession } from "../auth/middleware.js";
import { paged, pageParams } from "../pagination.js";
import { getApiTokenInfo, rotateApiToken } from "../auth/tokens.js";
import {
  adminPathError,
  getAdminPath,
  normalizeAdminPath,
  setAdminPath,
} from "../adminPath.js";

/**
 * Who can get into the dashboard: the admin accounts and the API token.
 * Mounted behind the admin guard, so every caller here is already authorised —
 * these routes only enforce the rules that keep an instance reachable (you
 * can't delete the last admin, you can't delete yourself).
 */
export function accountRoutes(redis: Redis) {
  const routes = new Hono();

  /** GET /api/admin/session — who the current caller is. */
  routes.get("/admin/session", (c) => {
    const session = currentSession(c);
    return c.json(
      session
        ? { kind: "session", username: session.username, expiresAt: session.expiresAt }
        : { kind: "apiToken" },
    );
  });

  /** GET /api/admin/admins — operator accounts (customers live under /admin/users). */
  routes.get("/admin/admins", async (c) => {
    const rows = await getDb()
      .select()
      .from(users)
      .where(eq(users.role, "admin"))
      .orderBy(users.createdAt);
    const session = currentSession(c);
    return c.json({
      admins: rows.map((r) => ({
        id: r.publicId,
        username: r.username,
        createdAt: r.createdAt.toISOString(),
        lastLoginAt: r.lastLoginAt?.toISOString() ?? null,
        isSelf: r.username === session?.username,
      })),
    });
  });

  /**
   * GET /api/admin/users — the customer list: plan, key count, spend this
   * month. Operators are excluded; they're managed under Access, and their own
   * keys live on their own account page.
   */
  routes.get("/admin/users", async (c) => {
    const page = pageParams(c.req.query());
    // Counted separately: the list query groups by user to count keys, so its
    // own row count is per page and says nothing about the table.
    const [totals] = await getDb()
      .select({ n: count() })
      .from(users)
      .where(eq(users.role, "customer"));

    const rows = await getDb()
      .select({
        internalId: users.id,
        id: users.publicId,
        username: users.username,
        email: users.email,
        name: users.name,
        role: users.role,
        plan: plans.slug,
        planLabel: plans.label,
        monthlyRequests: plans.monthlyRequests,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
        keys: sql<number>`count(${apiKeys.id})`,
      })
      .from(users)
      .innerJoin(plans, eq(users.planId, plans.id))
      .leftJoin(apiKeys, eq(apiKeys.userId, users.id))
      .where(eq(users.role, "customer"))
      .groupBy(users.id, plans.id)
      .orderBy(desc(users.createdAt))
      .limit(page.perPage)
      .offset(page.offset);

    const list = await Promise.all(
      rows.map(async ({ internalId, ...r }) => ({
        ...r,
        keys: Number(r.keys),
        usage: await accountUsage(redis, internalId),
        createdAt: r.createdAt.toISOString(),
        lastLoginAt: r.lastLoginAt?.toISOString() ?? null,
      })),
    );

    // `users` stays for the shape the dashboard already reads; the rest is what
    // the table needs to render a pager.
    const { rows: _rows, ...meta } = paged(list, totals?.n ?? 0, page);
    return c.json({ users: list, ...meta });
  });

  /** POST /api/admin/admins { username, password } */
  routes.post("/admin/admins", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      username?: string;
      password?: string;
    } | null;

    const username = usernameSchema.safeParse(body?.username ?? "");
    if (!username.success) return c.json({ error: firstIssue(username.error) }, 400);
    const password = passwordSchema.safeParse(body?.password ?? "");
    if (!password.success) return c.json({ error: firstIssue(password.error) }, 400);

    const [existing] = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username.data))
      .limit(1);
    if (existing) return c.json({ error: "That username is taken" }, 409);

    const [created] = await getDb()
      .insert(users)
      .values({
        username: username.data,
        role: "admin",
        planId: await defaultPlanId(),
        passwordHash: await hashPassword(password.data),
      })
      .returning({ publicId: users.publicId });

    return c.json({ id: created?.publicId, username: username.data }, 201);
  });

  /** POST /api/admin/account/password — change your own, current password required. */
  routes.post("/admin/account/password", async (c) => {
    const session = currentSession(c);
    if (!session) {
      return c.json({ error: "Sign in to change a password" }, 403);
    }
    const body = (await c.req.json().catch(() => null)) as {
      currentPassword?: string;
      newPassword?: string;
    } | null;

    const next = passwordSchema.safeParse(body?.newPassword ?? "");
    if (!next.success) return c.json({ error: firstIssue(next.error) }, 400);

    const [admin] = await getDb()
      .select()
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    if (!admin) return c.json({ error: "Account no longer exists" }, 404);

    if (!admin.passwordHash) {
      // OAuth accounts have nothing to compare against.
      return c.json({ error: "This account signs in with a provider" }, 400);
    }
    if (!(await verifyPassword(body?.currentPassword ?? "", admin.passwordHash))) {
      return c.json({ error: "Current password is incorrect" }, 401);
    }

    await getDb()
      .update(users)
      .set({ passwordHash: await hashPassword(next.data) })
      .where(eq(users.id, admin.id));
    // Other browsers holding this account's sessions are signed out.
    await revokeAllSessions(redis, admin.id);

    return c.json({ ok: true, signedOut: true });
  });

  /** PUT /api/admin/admins/:id/password — reset someone else's password. */
  routes.put("/admin/admins/:id/password", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { password?: string } | null;
    const password = passwordSchema.safeParse(body?.password ?? "");
    if (!password.success) return c.json({ error: firstIssue(password.error) }, 400);

    const [admin] = await getDb()
      .select()
      .from(users)
      .where(eq(users.publicId, c.req.param("id")))
      .limit(1);
    if (!admin) return c.json({ error: "Admin not found" }, 404);

    const session = currentSession(c);
    if (session && session.userId === admin.id) {
      // Your own password goes through the current-password check instead.
      return c.json({ error: "Use the change-password form for your own account" }, 400);
    }

    await getDb()
      .update(users)
      .set({ passwordHash: await hashPassword(password.data) })
      .where(eq(users.id, admin.id));
    await revokeAllSessions(redis, admin.id);

    return c.json({ ok: true });
  });

  /** DELETE /api/admin/admins/:id */
  routes.delete("/admin/admins/:id", async (c) => {
    const [admin] = await getDb()
      .select()
      .from(users)
      .where(eq(users.publicId, c.req.param("id")))
      .limit(1);
    if (!admin) return c.json({ error: "Admin not found" }, 404);

    const session = currentSession(c);
    if (session && session.userId === admin.id) {
      return c.json({ error: "You can't delete the account you're signed in as" }, 400);
    }

    // Customers may come and go; an instance with no operator is unreachable.
    const [operators] = await getDb()
      .select({ n: count() })
      .from(users)
      .where(eq(users.role, "admin"));
    if (admin.role === "admin" && (operators?.n ?? 0) <= 1) {
      return c.json({ error: "The last admin can't be deleted" }, 400);
    }

    await getDb().delete(users).where(eq(users.id, admin.id));
    await revokeAllSessions(redis, admin.id);
    return c.json({ ok: true });
  });

  /**
   * POST /api/admin/sessions/revoke-all — sign every admin out everywhere,
   * including the caller. For a suspected leak, or a laptop left signed in.
   */
  routes.post("/admin/sessions/revoke-all", async (c) => {
    const rows = await getDb().select({ id: users.id }).from(users);
    await Promise.all(rows.map((r) => revokeAllSessions(redis, r.id)));
    return c.json({ ok: true, admins: rows.length });
  });

  /** GET /api/admin/admin-path — where the dashboard is currently served. */
  routes.get("/admin/admin-path", async (c) =>
    c.json({ path: await getAdminPath(), default: "admin" }),
  );

  /** PUT /api/admin/admin-path { path } — move the dashboard. */
  routes.put("/admin/admin-path", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { path?: string } | null;
    const path = normalizeAdminPath(body?.path ?? "");
    const error = adminPathError(path);
    if (error) return c.json({ error }, 400);

    await setAdminPath(path);
    return c.json({ path });
  });

  /** GET /api/admin/api-token — the active token's prefix and usage. */
  routes.get("/admin/api-token", async (c) => c.json({ token: await getApiTokenInfo() }));

  /**
   * POST /api/admin/api-token — replace the API token. The plaintext comes back
   * once and is never retrievable again; the old token stops working instantly.
   */
  routes.post("/admin/api-token", async (c) => {
    const token = await rotateApiToken();
    return c.json({ token, info: await getApiTokenInfo() });
  });

  return routes;
}
