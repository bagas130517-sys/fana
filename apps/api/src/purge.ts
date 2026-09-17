import { lte } from "drizzle-orm";
import { getDb, messages, reservations } from "@fana/db";
import { deleteMessagesWhere } from "./blobs.js";

/** Delete expired messages (+ their blobs) and expired reservations. Returns messages removed. */
export async function purgeExpired(): Promise<number> {
  const now = new Date();
  const count = await deleteMessagesWhere(lte(messages.expiresAt, now));
  await getDb().delete(reservations).where(lte(reservations.expiresAt, now));
  return count;
}

/** Start a periodic purge sweep. Returns a stop function. */
export function startPurgeJob(intervalMs = 60_000): () => void {
  const timer = setInterval(() => {
    purgeExpired()
      .then((n) => {
        if (n > 0) console.log(`[purge] removed ${n} expired message(s)`);
      })
      .catch((err: unknown) => console.error("[purge] failed:", err));
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
