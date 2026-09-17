import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { getDb, messages, attachments } from "@fana/db";
import { getStorage } from "@fana/storage";
import { deleteMessagesWhere } from "../blobs.js";
import { serializeMessage } from "../serialize.js";
import { publicOnly } from "../visibility.js";

// `:id` / `:attId` in these routes are the unguessable public_id (uuid), never
// the internal incremental key.
//
// Keyless surface, so `publicOnly` everywhere: a message belonging to a private
// /v1 inbox answers 404 here even when its id is known — it is readable through
// /v1 with the owning account's key.
export const messageRoutes = new Hono();

/** GET /api/messages/:id — full message; marks it seen. */
messageRoutes.get("/messages/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const [row] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.publicId, id), publicOnly))
    .limit(1);
  if (!row) return c.json({ error: "Not found" }, 404);

  if (!row.seen) {
    await db.update(messages).set({ seen: true }).where(eq(messages.id, row.id));
  }

  return c.json({ message: { ...(await serializeMessage(row)), seen: true } });
});

/** DELETE /api/messages/:id */
messageRoutes.delete("/messages/:id", async (c) => {
  const id = c.req.param("id");
  await deleteMessagesWhere(and(eq(messages.publicId, id), publicOnly)!);
  return c.json({ ok: true });
});

/** GET /api/messages/:id/attachments/:attId — download an attachment. */
messageRoutes.get("/messages/:id/attachments/:attId", async (c) => {
  const attId = c.req.param("attId");
  const db = getDb();
  const [att] = await db
    .select({
      content: attachments.content,
      storageKey: attachments.storageKey,
      contentType: attachments.contentType,
      filename: attachments.filename,
      size: attachments.size,
      messagePublicId: messages.publicId,
    })
    .from(attachments)
    .innerJoin(messages, eq(attachments.messageId, messages.id))
    .where(and(eq(attachments.publicId, attId), publicOnly))
    .limit(1);
  if (!att || att.messagePublicId !== c.req.param("id")) {
    return c.json({ error: "Not found" }, 404);
  }
  const buf = await getStorage().get({ storageKey: att.storageKey, content: att.content });
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": att.contentType,
      "Content-Disposition": `attachment; filename="${att.filename.replace(/"/g, "")}"`,
      "Content-Length": String(att.size),
    },
  });
});

/** GET /api/messages/:id/raw — original RFC822 source. */
messageRoutes.get("/messages/:id/raw", async (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const [row] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.publicId, id), publicOnly))
    .limit(1);
  if (!row?.raw) return c.json({ error: "Not found" }, 404);
  return new Response(new Uint8Array(row.raw), {
    status: 200,
    headers: { "Content-Type": "message/rfc822" },
  });
});
