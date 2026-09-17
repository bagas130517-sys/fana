import type { Context, Next } from "hono";
import type Redis from "ioredis";
import { withinLimit } from "@fana/core";
import { resolveKey, type KeyWithPlan } from "./keys.js";
import { accountUsage, recordBurst, recordRequest } from "./usage.js";

/**
 * Guards /v1. Quota and burst belong to the *account*, not the key: holding two
 * keys must not double what a customer may send. Every response says how much
 * is left, so nobody has to guess why they got a 429.
 */

declare module "hono" {
  interface ContextVariableMap {
    apiKey: KeyWithPlan;
  }
}

export function requireApiKey(redis: Redis) {
  return async (c: Context, next: Next) => {
    const header = c.req.header("authorization") ?? "";
    const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!presented) {
      return c.json(
        { error: "Send your API key as: Authorization: Bearer <key>" },
        401,
      );
    }

    const found = await resolveKey(presented);
    if (!found) return c.json({ error: "Invalid API key" }, 401);

    const { plan } = found;
    const burst = await recordBurst(redis, found.key.userId);
    if (!withinLimit(burst - 1, plan.requestsPerMinute)) {
      c.header("Retry-After", "60");
      return c.json(
        {
          error: "Rate limit exceeded",
          limit: plan.requestsPerMinute,
          window: "1m",
        },
        429,
      );
    }

    // Checked before counting, so the request that hits the ceiling is rejected
    // rather than charged.
    const used = await accountUsage(redis, found.key.userId);
    if (!withinLimit(used, plan.monthlyRequests)) {
      return c.json(
        {
          error: "Monthly quota exhausted",
          limit: plan.monthlyRequests,
          plan: plan.slug,
        },
        429,
      );
    }

    const total = await recordRequest(redis, found.key.id, found.key.userId);
    c.header("X-Plan", plan.slug);
    c.header("X-Quota-Limit", String(plan.monthlyRequests));
    c.header(
      "X-Quota-Remaining",
      String(
        plan.monthlyRequests === 0
          ? -1
          : Math.max(0, plan.monthlyRequests - total),
      ),
    );

    c.set("apiKey", found);
    await next();
  };
}

export function currentKey(c: Context): KeyWithPlan {
  return c.get("apiKey");
}
