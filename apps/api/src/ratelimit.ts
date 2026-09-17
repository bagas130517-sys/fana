import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { RedisStore } from "@hono-rate-limiter/redis";
import type Redis from "ioredis";

/**
 * Rate limiting via hono-rate-limiter + its Redis store, rather than the
 * hand-rolled INCR/EXPIRE counter this used to be: standard `RateLimit-*`
 * headers, a real sliding window and one shared implementation for the public
 * API, the admin API and sign-in.
 */

interface Options {
  redis: Redis;
  max: number;
  windowSeconds: number;
  /** Bucket name, so admin, login and public traffic don't share a budget. */
  prefix: string;
}

/** The store speaks the Upstash client shape; ioredis needs a thin adapter. */
function store(redis: Redis, prefix: string) {
  return new RedisStore({
    prefix: `ratelimit:${prefix}:`,
    client: {
      scriptLoad: (script: string) => redis.script("LOAD", script) as Promise<string>,
      evalsha: <TArgs extends unknown[], TData = unknown>(
        sha1: string,
        keys: string[],
        args: TArgs,
      ) => redis.evalsha(sha1, keys.length, ...keys, ...(args as string[])) as Promise<TData>,
      decr: (key: string) => redis.decr(key),
      del: (key: string) => redis.del(key),
    },
  });
}

export const PRIVATE_IP =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd][0-9a-f]{2}:)/i;

/** What a request says about who sent it. Headers as given, socket as observed. */
export interface ClientSource {
  forwardedFor?: string;
  realIp?: string;
  socketAddress?: string;
}

export interface Client {
  /** The bucket this request counts against. */
  key: string;
  /** True when the request must not be counted at all. */
  internal: boolean;
}

/**
 * Who to charge a request to, and whether to charge it at all.
 *
 * Behind the bundled Caddy the socket belongs to the proxy, so the forwarded
 * header is what identifies a caller; direct connections fall back to the
 * socket. Server-side rendering calls the API from inside the deployment, and
 * every one of those requests carries the web container's address — counting
 * them as a single client would let normal traffic exhaust the budget for
 * everybody, so unproxied requests from a private address are not limited.
 *
 * A forwarded header always means the request came through the proxy, and it is
 * therefore somebody's traffic even when the socket is private. Skipping on the
 * socket alone would hand anyone behind that proxy an unlimited budget.
 */
export function resolveClient({
  forwardedFor,
  realIp,
  socketAddress,
}: ClientSource): Client {
  const forwarded = forwardedFor?.split(",")[0]?.trim() || realIp?.trim() || undefined;
  const socket = socketAddress ?? "unknown";
  return {
    key: forwarded ?? socket,
    internal: forwarded === undefined && PRIVATE_IP.test(socket),
  };
}

function sourceOf(c: Context): ClientSource {
  let socketAddress: string | undefined;
  try {
    socketAddress = getConnInfo(c).remote.address;
  } catch {
    socketAddress = undefined;
  }
  return {
    forwardedFor: c.req.header("x-forwarded-for"),
    realIp: c.req.header("x-real-ip"),
    socketAddress,
  };
}

const clientKey = (c: Context) => resolveClient(sourceOf(c)).key;
const isInternal = (c: Context) => resolveClient(sourceOf(c)).internal;

export function rateLimit({ redis, max, windowSeconds, prefix }: Options) {
  return rateLimiter({
    windowMs: windowSeconds * 1000,
    limit: max,
    standardHeaders: "draft-6",
    keyGenerator: clientKey,
    skip: isInternal,
    store: store(redis, prefix),
    message: { error: "Rate limit exceeded" },
  });
}
