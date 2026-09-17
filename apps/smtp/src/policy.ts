import { eq } from "drizzle-orm";
import { getDb, plans, reservations, users } from "@fana/db";
import { messageTtlMs } from "@fana/core";

/**
 * What arriving mail for an address is entitled to: how long it lives, and who
 * (if anyone) owns it.
 *
 * An inbox minted through the customer API follows the plan of the account that
 * minted it — that's what the retention line on a plan means — and, if it was
 * minted private, its mail is stamped with that account so only its keys can
 * read it. Everything else is public and follows MESSAGE_TTL_MINUTES.
 *
 * The cache holds *promises*, not results, so the lookup can be started the
 * moment the recipients are known and awaited later without a second query —
 * and so two recipients of the same message don't race each other to ask.
 */

export interface MailboxPolicy {
  retentionMs: number;
  /** Non-null only for a private inbox: stamped onto the stored message. */
  ownerUserId: number | null;
}

const CACHE_MS = 60_000;
const cache = new Map<string, { policy: Promise<MailboxPolicy>; at: number }>();

async function lookup(mailbox: string): Promise<MailboxPolicy> {
  const policy: MailboxPolicy = { retentionMs: messageTtlMs(), ownerUserId: null };
  try {
    const [row] = await getDb()
      .select({
        retentionMinutes: plans.retentionMinutes,
        ownerUserId: reservations.ownerUserId,
        isPrivate: reservations.isPrivate,
      })
      .from(reservations)
      .innerJoin(users, eq(reservations.ownerUserId, users.id))
      .innerJoin(plans, eq(users.planId, plans.id))
      .where(eq(reservations.address, mailbox))
      .limit(1);
    if (row) {
      policy.retentionMs = row.retentionMinutes * 60_000;
      // A public API inbox still gets the plan's retention — paying for longer
      // storage should not force the mail to be private too.
      if (row.isPrivate) policy.ownerUserId = row.ownerUserId;
    }
  } catch (err) {
    // Never drop mail over a policy lookup — keep the public default. Resolving
    // rather than rejecting also keeps a failure from being cached as a
    // rejected promise every later caller would trip over.
    console.error("[policy] lookup failed:", err);
  }
  return policy;
}

export function mailboxPolicyFor(mailbox: string): Promise<MailboxPolicy> {
  const cached = cache.get(mailbox);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.policy;

  const policy = lookup(mailbox);
  if (cache.size > 5_000) cache.clear();
  cache.set(mailbox, { policy, at: Date.now() });
  return policy;
}
