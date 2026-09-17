import { allowSender, type CounterRedis } from "./ratelimit.js";

export const BLOCKLIST_KEY = "smtp:blocklist";
export const SENDERS_KEY = "stats:senders";

/** The commands screening needs, so a test can hand in a fake. */
export interface ScreenRedis extends CounterRedis {
  sismember(key: string, member: string): Promise<number>;
  zincrby(key: string, increment: number, member: string): Promise<unknown>;
}

/**
 * Screen an inbound sender by IP before accepting a message:
 * 1. reject if the IP is on the admin blocklist,
 * 2. reject if it's over the per-IP flood limit,
 * 3. otherwise record it for the admin "top senders" view and accept.
 * Returns an Error to reject with, or null to accept. Fails open on Redis errors.
 */
export async function screenSender(
  redis: ScreenRedis,
  ip: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Error | null> {
  try {
    if ((await redis.sismember(BLOCKLIST_KEY, ip)) === 1) {
      return new Error("554 5.7.1 Sender blocked");
    }
    if (!(await allowSender(redis, ip, env))) {
      return new Error("451 4.7.0 Too many messages, try again later");
    }
    await redis.zincrby(SENDERS_KEY, 1, ip);
    return null;
  } catch (err) {
    console.error("[smtp] sender screen failed, allowing:", err);
    return null;
  }
}
