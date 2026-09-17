import type Redis from "ioredis";

/**
 * Login throttling. Counts failures per IP *and* per username: the IP counter
 * stops one host grinding through passwords, the username counter stops a
 * distributed attempt on a single account. Successful logins clear both.
 */

const WINDOW_SECONDS = Number(process.env.LOGIN_LOCKOUT_WINDOW_SECONDS ?? "900");
const MAX_PER_IP = Number(process.env.LOGIN_MAX_ATTEMPTS_IP ?? "10");
const MAX_PER_USER = Number(process.env.LOGIN_MAX_ATTEMPTS_USER ?? "5");

const ipKey = (ip: string) => `login:fail:ip:${ip}`;
const userKey = (username: string) => `login:fail:user:${username}`;

export interface LockoutState {
  locked: boolean;
  /** Seconds until the lock lifts; 0 when not locked. */
  retryAfter: number;
  /** Attempts left before this IP locks out, for the sign-in form. */
  remaining: number;
}

export async function checkLockout(
  redis: Redis,
  ip: string,
  username: string,
): Promise<LockoutState> {
  const [ipFails, userFails] = (
    await redis.mget(ipKey(ip), userKey(username))
  ).map((v) => Number(v ?? 0));

  const locked = (ipFails ?? 0) >= MAX_PER_IP || (userFails ?? 0) >= MAX_PER_USER;
  if (!locked) {
    return {
      locked: false,
      retryAfter: 0,
      remaining: Math.max(0, MAX_PER_IP - (ipFails ?? 0)),
    };
  }

  const ttls = await Promise.all([redis.ttl(ipKey(ip)), redis.ttl(userKey(username))]);
  return {
    locked: true,
    retryAfter: Math.max(...ttls.map((t) => (t > 0 ? t : 0)), 1),
    remaining: 0,
  };
}

export async function recordFailure(
  redis: Redis,
  ip: string,
  username: string,
): Promise<void> {
  for (const key of [ipKey(ip), userKey(username)]) {
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, WINDOW_SECONDS);
  }
}

export async function clearFailures(
  redis: Redis,
  ip: string,
  username: string,
): Promise<void> {
  await redis.del(ipKey(ip), userKey(username));
}
