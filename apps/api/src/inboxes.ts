import { and, count, desc, eq, gt, inArray } from "drizzle-orm";
import { getDb, messages, reservations } from "@fana/db";
import { deleteMessagesWhere } from "./blobs.js";
import { visibleTo } from "./visibility.js";
import { paged, type PageParams, type Paged } from "./pagination.js";

/**
 * Inboxes an account is holding. Two surfaces ask the same questions — `/v1`
 * with a key, `/api/account/inboxes` with a session — so the answer is written
 * once here: a customer must not be told a different story depending on which
 * one they looked at.
 */

/** Beyond this a listing is a report, not a control surface. */
const LIST_LIMIT = 200;

export interface HeldInbox {
  address: string;
  private: boolean;
  reservedUntil: string;
  createdAt: string;
  /** Unexpired messages the owner can see in it. */
  messages: number;
}

/** Live reservations for `userId`, newest first, with their message counts. */
export async function heldInboxes(
  userId: number,
  page?: PageParams,
): Promise<Paged<HeldInbox>> {
  const db = getDb();
  const now = new Date();
  const params = page ?? { page: 1, perPage: LIST_LIMIT, offset: 0 };
  const live = and(eq(reservations.ownerUserId, userId), gt(reservations.expiresAt, now));

  const [totals] = await db.select({ n: count() }).from(reservations).where(live);
  const rows = await db
    .select()
    .from(reservations)
    .where(live)
    .orderBy(desc(reservations.createdAt))
    .limit(params.perPage)
    .offset(params.offset);
  if (rows.length === 0) return paged([], totals?.n ?? 0, params);

  // One grouped count for the whole page rather than a query per inbox.
  const counts = await db
    .select({ mailbox: messages.mailbox, n: count() })
    .from(messages)
    .where(
      and(
        inArray(
          messages.mailbox,
          rows.map((r) => r.address),
        ),
        gt(messages.expiresAt, now),
        visibleTo(userId),
      ),
    )
    .groupBy(messages.mailbox);

  const byMailbox = new Map(counts.map((c) => [c.mailbox, c.n]));
  return paged(
    rows.map((r) => ({
      address: r.address,
      private: r.isPrivate,
      reservedUntil: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      messages: byMailbox.get(r.address) ?? 0,
    })),
    totals?.n ?? 0,
    params,
  );
}

/** How many the account is holding — what `concurrentInboxes` is compared to. */
export async function heldCount(userId: number): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(reservations)
    .where(and(eq(reservations.ownerUserId, userId), gt(reservations.expiresAt, new Date())));
  return row?.n ?? 0;
}

/**
 * Give an address back: drops the hold *and* its mail, which is what frees a
 * concurrent-inbox slot. Null when the address isn't this account's — releasing
 * somebody else's hold would hand their inbox to the next caller who asks.
 */
export async function releaseInbox(
  userId: number,
  address: string,
): Promise<{ deleted: number } | null> {
  const [released] = await getDb()
    .delete(reservations)
    .where(
      and(eq(reservations.address, address), eq(reservations.ownerUserId, userId)),
    )
    .returning({ address: reservations.address });
  if (!released) return null;

  const deleted = await deleteMessagesWhere(
    and(eq(messages.mailbox, address), visibleTo(userId))!,
  );
  return { deleted };
}
