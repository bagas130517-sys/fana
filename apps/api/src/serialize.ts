import { eq, inArray } from "drizzle-orm";
import { attachments, getDb, type MessageRow } from "@fana/db";
import { extractFromMessage, type Message, type Verdict } from "@fana/core";

/**
 * Row → API shape. Lived inline in two routes and was about to be copied into
 * a third (/v1), so it moved here — the public and customer APIs must not drift
 * into describing the same message differently.
 *
 * Reading one message extracts its codes and links; listing many does not. The
 * split is the point: extraction is for the message somebody opened, and a
 * hundred-row listing would pay for it on ninety-nine nobody read.
 */

type AttachmentSummary = Message["attachments"][number];

function toMessage(
  row: MessageRow,
  atts: AttachmentSummary[],
  extract = false,
): Message {
  return {
    id: row.publicId,
    mailbox: row.mailbox,
    fromAddress: row.fromAddress,
    fromName: row.fromName,
    subject: row.subject,
    text: row.text,
    html: row.html,
    receivedAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    seen: row.seen,
    auth: {
      spf: row.spf,
      dkim: row.dkim,
      dmarc: row.dmarc,
      verdict: row.verdict as Verdict,
    },
    attachments: atts,
    ...(extract ? { extracted: extractFromMessage(row) } : {}),
  };
}

/** Serialize many rows, fetching their attachments in one query. */
export async function serializeMessages(rows: MessageRow[]): Promise<Message[]> {
  if (rows.length === 0) return [];

  const atts = await getDb()
    .select({
      messageId: attachments.messageId,
      id: attachments.publicId,
      filename: attachments.filename,
      contentType: attachments.contentType,
      size: attachments.size,
    })
    .from(attachments)
    .where(
      inArray(
        attachments.messageId,
        rows.map((r) => r.id),
      ),
    );

  const byMessage = new Map<number, AttachmentSummary[]>();
  for (const { messageId, ...rest } of atts) {
    const list = byMessage.get(messageId) ?? [];
    list.push(rest);
    byMessage.set(messageId, list);
  }

  return rows.map((row) => toMessage(row, byMessage.get(row.id) ?? []));
}

/** One message, with its codes and links pulled out. */
export async function serializeMessage(row: MessageRow): Promise<Message> {
  const atts = await getDb()
    .select({
      id: attachments.publicId,
      filename: attachments.filename,
      contentType: attachments.contentType,
      size: attachments.size,
    })
    .from(attachments)
    .where(eq(attachments.messageId, row.id));

  return toMessage(row, atts, true);
}
