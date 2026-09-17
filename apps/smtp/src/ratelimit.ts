/**
 * Per-IP fixed-window flood guard for inbound mail. Returns true if the sender
 * may proceed. Disabled when SMTP_RATE_LIMIT_MAX <= 0. Fails open on Redis
 * errors so a cache outage never blocks all mail.
 *
 * Limits are read per call rather than captured at import, matching the config
 * helpers in `@fana/core`. A module-level constant cannot be exercised at two
 * different limits, which is most of what there is to test here.
 */

/** Just enough of ioredis to count, so a test can hand in a fake. */
export interface CounterRedis {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

export const senderKey = (ip: string) => `smtp:rl:${ip}`;

export async function allowSender(
  redis: CounterRedis,
  ip: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const max = Number(env.SMTP_RATE_LIMIT_MAX ?? "30");
  const windowSeconds = Number(env.SMTP_RATE_LIMIT_WINDOW_SECONDS ?? "60");
  if (!Number.isFinite(max) || max <= 0) return true;

  try {
    const key = senderKey(ip);
    const count = await redis.incr(key);
    // Only the hit that created the key sets its lifetime. Re-expiring on every
    // hit would slide the window forward, and a sender pacing itself just under
    // the window would never reach the limit.
    if (count === 1) {
      await redis.expire(key, Number.isFinite(windowSeconds) ? windowSeconds : 60);
    }
    return count <= max;
  } catch (err) {
    console.error("[smtp] rate-limit check failed, allowing:", err);
    return true;
  }
}
