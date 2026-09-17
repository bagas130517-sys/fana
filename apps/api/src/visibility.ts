import { eq, isNull, or, type SQL } from "drizzle-orm";
import { messages } from "@fana/db";

/**
 * The two filters a read path over `messages` may use. They live together so
 * that choosing one is a deliberate act rather than something each route
 * re-derives — an unfiltered query is the bug this file exists to prevent.
 */

/**
 * Public mail only. Every keyless surface (`/api/mailbox/*`, `/api/messages/*`)
 * uses this: it has no way to prove who is asking, so it may only ever answer
 * with what is public by design.
 */
export const publicOnly: SQL = isNull(messages.ownerUserId);

/**
 * Public mail plus what this account owns — the `/v1` and `/api/account/*` rule.
 * Somebody else's private message simply isn't in the result, which makes it a
 * 404 rather than a 403 and so confirms nothing about the address.
 */
export const visibleTo = (userId: number): SQL =>
  or(isNull(messages.ownerUserId), eq(messages.ownerUserId, userId))!;
