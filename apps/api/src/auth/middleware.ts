import type { Context, Next } from "hono";
import type Redis from "ioredis";
import { touchSession, type Session } from "./sessions.js";
import { verifyApiToken } from "./tokens.js";

/**
 * Guards routes that need somebody signed in. Two callers, one header: a session
 * token (a human in the dashboard) or the instance API token (a script). The
 * session is checked first — it's a Redis hit, while the token path costs a DB
 * round trip.
 */

export type Caller =
  | { kind: "session"; session: Session }
  | { kind: "apiToken" };

declare module "hono" {
  interface ContextVariableMap {
    caller: Caller;
  }
}

export function clientIp(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    "unknown"
  );
}

export function bearer(c: Context): string {
  const header = c.req.header("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export function requireSession(redis: Redis) {
  return async (c: Context, next: Next) => {
    const token = bearer(c);
    if (!token) return c.json({ error: "Unauthorized" }, 401);

    const session = await touchSession(redis, token);
    if (session) {
      c.set("caller", { kind: "session", session });
      return next();
    }

    if (await verifyApiToken(token)) {
      c.set("caller", { kind: "apiToken" });
      return next();
    }

    return c.json({ error: "Unauthorized" }, 401);
  };
}

/**
 * Actions tied to "who am I" (change my password, sign out) make no sense for
 * the machine token, so those routes require a signed-in user.
 */
export function currentSession(c: Context): Session | null {
  const caller = c.get("caller");
  return caller?.kind === "session" ? caller.session : null;
}

/**
 * Operator-only. The instance API token passes: it belongs to whoever runs the
 * instance, and it is how scripts drive the admin API.
 */
export function requireAdminRole() {
  return async (c: Context, next: Next) => {
    const caller = c.get("caller");
    if (caller?.kind === "session" && caller.session.role !== "admin") {
      return c.json({ error: "Operators only" }, 403);
    }
    await next();
  };
}
