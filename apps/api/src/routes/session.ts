import { Hono } from "hono";
import type Redis from "ioredis";
import { eq } from "drizzle-orm";
import { getDb, users } from "@fana/db";
import { credentialsSchema, firstIssue } from "@fana/core";
import { DUMMY_HASH, verifyPassword } from "../auth/passwords.js";
import { createSession, revokeSession, sessionTtlSeconds } from "../auth/sessions.js";
import { checkLockout, clearFailures, recordFailure } from "../auth/lockout.js";
import { bearer, clientIp } from "../auth/middleware.js";

/**
 * Sign-in and sign-out. Unauthenticated by definition, so this is the one place
 * that has to survive being hammered — hence the lockout and the deliberately
 * vague failure message.
 */
export function sessionRoutes(redis: Redis) {
  const routes = new Hono();

  /** POST /api/admin/login { username, password } */
  routes.post("/admin/login", async (c) => {
    const parsed = credentialsSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: firstIssue(parsed.error) }, 400);
    }
    const { username, password } = parsed.data;
    const ip = clientIp(c);

    const lock = await checkLockout(redis, ip, username);
    if (lock.locked) {
      c.header("Retry-After", String(lock.retryAfter));
      return c.json(
        {
          error: "Too many attempts. Try again later.",
          retryAfter: lock.retryAfter,
        },
        429,
      );
    }

    const [user] = await getDb()
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    // Hash even when the user doesn't exist so the response time doesn't say so.
    // A customer signed in through OAuth has no password: the compare still
    // runs against the dummy hash so the answer times the same as a wrong one.
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !user.passwordHash || !ok) {
      await recordFailure(redis, ip, username);
      const after = await checkLockout(redis, ip, username);
      return c.json(
        {
          error: "Invalid username or password",
          attemptsRemaining: after.remaining,
        },
        401,
      );
    }

    await clearFailures(redis, ip, username);
    await getDb()
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    const { token, expiresAt } = await createSession(redis, user);
    return c.json({
      token,
      expiresAt,
      ttlSeconds: sessionTtlSeconds(),
      user: { username: user.username, publicId: user.publicId, role: user.role },
    });
  });

  /** DELETE /api/admin/logout — revoke the caller's own session. */
  routes.delete("/admin/logout", async (c) => {
    const token = bearer(c);
    if (token) await revokeSession(redis, token);
    return c.json({ ok: true });
  });

  return routes;
}
