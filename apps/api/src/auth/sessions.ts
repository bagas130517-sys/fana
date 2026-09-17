import { createHash, randomBytes } from "node:crypto";
import type Redis from "ioredis";

/**
 * Sessions for anyone signed in — operator or customer. An opaque random token
 * lives in the browser, its SHA-256 in Redis: no long-lived secret sits in
 * localStorage, and a stolen session expires and can be revoked, per user
 * (password change, OAuth unlink) or wholesale.
 */

export interface Session {
  userId: number;
  username: string;
  role: string;
  expiresAt: string;
}

const TTL_SECONDS = Math.max(
  60,
  Number(process.env.ADMIN_SESSION_TTL_MINUTES ?? "720") * 60,
);

const key = (token: string) =>
  `session:${createHash("sha256").update(token).digest("hex")}`;
const userIndex = (userId: number) => `user:sessions:${userId}`;

export function sessionTtlSeconds(): number {
  return TTL_SECONDS;
}

export async function createSession(
  redis: Redis,
  user: { id: number; username: string; role: string },
): Promise<{ token: string; expiresAt: string }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();

  await redis
    .multi()
    .set(
      key(token),
      JSON.stringify({ userId: user.id, username: user.username, role: user.role }),
      "EX",
      TTL_SECONDS,
    )
    // Index so a password change or deletion can drop this user's sessions.
    .sadd(userIndex(user.id), key(token))
    .expire(userIndex(user.id), TTL_SECONDS)
    .exec();

  return { token, expiresAt };
}

/** Look up a session and slide its expiry. Null when unknown or expired. */
export async function touchSession(
  redis: Redis,
  token: string,
): Promise<Session | null> {
  const raw = await redis.get(key(token));
  if (!raw) return null;

  const parsed = JSON.parse(raw) as {
    userId: number;
    username: string;
    role: string;
  };
  await redis.expire(key(token), TTL_SECONDS);
  await redis.expire(userIndex(parsed.userId), TTL_SECONDS);

  return {
    ...parsed,
    expiresAt: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
  };
}

export async function revokeSession(redis: Redis, token: string): Promise<void> {
  const raw = await redis.get(key(token));
  if (raw) {
    const { userId } = JSON.parse(raw) as { userId: number };
    await redis.srem(userIndex(userId), key(token));
  }
  await redis.del(key(token));
}

/** Sign a user out everywhere — used on password change and deletion. */
export async function revokeAllSessions(redis: Redis, userId: number): Promise<void> {
  const keys = await redis.smembers(userIndex(userId));
  if (keys.length > 0) await redis.del(...keys);
  await redis.del(userIndex(userId));
}
