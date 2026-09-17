import { sql } from "drizzle-orm";
import type Redis from "ioredis";
import { apiKeyUsage, getDb } from "@fana/db";
import { usagePeriod } from "@fana/core";

/**
 * Per-key request counting. Redis holds the live numbers because it's on every
 * request; Postgres holds the durable copy that survives a Redis flush and
 * backs any invoice. The flush is additive (`+= delta`), so a lost run is
 * caught by the next one rather than losing the month.
 */

const monthKey = (keyId: number, period: string) => `apiusage:${keyId}:${period}`;
// The quota belongs to the account, so enforcement counts per user; the
// per-key counter stays for "which key is busy?" in the dashboard.
const accountKey = (userId: number, period: string) =>
  `apiusage:user:${userId}:${period}`;
const minuteKey = (userId: number, minute: number) => `apirate:user:${userId}:${minute}`;
const DIRTY_SET = "apiusage:dirty";

/**
 * Count one request against both the key and the account it belongs to.
 * Returns the account's running total for the month — the number the quota is
 * measured against.
 */
export async function recordRequest(
  redis: Redis,
  keyId: number,
  userId: number,
): Promise<number> {
  const period = usagePeriod();
  const perKey = monthKey(keyId, period);
  const perAccount = accountKey(userId, period);
  // 40 days: comfortably past the month it belongs to, gone soon after.
  const ttl = 40 * 24 * 3600;

  const results = await redis
    .multi()
    .incr(perKey)
    .expire(perKey, ttl)
    .incr(perAccount)
    .expire(perAccount, ttl)
    .sadd(DIRTY_SET, `${keyId}:${period}`)
    .exec();

  return Number(results?.[2]?.[1] ?? 0);
}

/** One key's requests this month — for display, not for the quota. */
export async function monthlyUsage(redis: Redis, keyId: number): Promise<number> {
  return Number((await redis.get(monthKey(keyId, usagePeriod()))) ?? 0);
}

/** The account's requests this month: what the plan's quota applies to. */
export async function accountUsage(redis: Redis, userId: number): Promise<number> {
  return Number((await redis.get(accountKey(userId, usagePeriod()))) ?? 0);
}

/** Fixed-window burst counter, per account. Requests made in the current minute. */
export async function recordBurst(redis: Redis, userId: number): Promise<number> {
  const minute = Math.floor(Date.now() / 60_000);
  const key = minuteKey(userId, minute);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 120);
  return count;
}

/**
 * Copy the live counters into Postgres. Runs periodically and on shutdown:
 * Redis is the fast path, but nobody should be billed from a cache.
 */
export async function flushUsage(redis: Redis): Promise<number> {
  const dirty = await redis.smembers(DIRTY_SET);
  if (dirty.length === 0) return 0;

  const db = getDb();
  let flushed = 0;

  for (const entry of dirty) {
    const [rawKeyId, period] = entry.split(":");
    const keyId = Number(rawKeyId);
    if (!Number.isInteger(keyId) || !period) {
      await redis.srem(DIRTY_SET, entry);
      continue;
    }

    const total = Number((await redis.get(monthKey(keyId, period))) ?? 0);
    if (total === 0) {
      await redis.srem(DIRTY_SET, entry);
      continue;
    }

    // The stored row is authoritative for the period, so set rather than add:
    // the Redis counter already is the running total for that month.
    await db
      .insert(apiKeyUsage)
      .values({ keyId, period, requests: total })
      .onConflictDoUpdate({
        target: [apiKeyUsage.keyId, apiKeyUsage.period],
        set: { requests: total, updatedAt: new Date() },
      })
      // A key deleted mid-flight takes its usage with it; skip rather than throw.
      .catch(() => undefined);

    await redis.srem(DIRTY_SET, entry);
    flushed++;
  }

  return flushed;
}

export function startUsageFlush(redis: Redis, intervalMs = 60_000): () => Promise<void> {
  const timer = setInterval(() => {
    flushUsage(redis).catch((err: unknown) => console.error("[usage] flush failed:", err));
  }, intervalMs);
  timer.unref();

  return async () => {
    clearInterval(timer);
    await flushUsage(redis).catch(() => undefined);
  };
}

/** Durable totals for the dashboard, newest period first. */
export async function usageHistory(keyId: number): Promise<{ period: string; requests: number }[]> {
  return getDb()
    .select({ period: apiKeyUsage.period, requests: apiKeyUsage.requests })
    .from(apiKeyUsage)
    .where(sql`${apiKeyUsage.keyId} = ${keyId}`)
    .orderBy(sql`${apiKeyUsage.period} desc`)
    .limit(12);
}
