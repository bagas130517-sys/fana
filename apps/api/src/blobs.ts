import { eq, inArray, type SQL } from "drizzle-orm";
import { getDb, messages, attachments } from "@fana/db";
import { getStorage } from "@fana/storage";

/**
 * Delete every message matching `where` along with its attachment blobs — for
 * the s3 driver that means removing the objects from the bucket (the db driver
 * relies on row cascade). Returns the number of messages deleted.
 */
export async function deleteMessagesWhere(where: SQL): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: messages.id, key: attachments.storageKey })
    .from(messages)
    .leftJoin(attachments, eq(attachments.messageId, messages.id))
    .where(where);

  if (rows.length === 0) return 0;

  const storage = getStorage();
  await Promise.all(
    rows
      .map((r) => r.key)
      .filter((k): k is string => Boolean(k))
      .map((k) => storage.del(k)),
  );

  const ids = [...new Set(rows.map((r) => r.id))];
  await db.delete(messages).where(inArray(messages.id, ids));
  return ids.length;
}
