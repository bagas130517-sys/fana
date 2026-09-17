import { getDb, messages, attachments, type NewAttachmentRow } from "@fana/db";
import {
  type AuthResults,
  type Message,
  type RealtimeEvent,
  type Verdict,
} from "@fana/core";
import { getStorage } from "@fana/storage";
import type { ParsedMail } from "mailparser";
import type Redis from "ioredis";
import { messageValuesFrom } from "./message.js";
import { mailboxPolicyFor } from "./policy.js";

export const REALTIME_CHANNEL = "fana:events";

interface StoreArgs {
  mailbox: string; // normalized recipient address
  parsed: ParsedMail;
  raw: Buffer;
  auth: AuthResults & { verdict: Verdict };
  redis: Redis;
}

/** Persist one parsed message for one recipient and publish a realtime event. */
export async function storeMessage({
  mailbox,
  parsed,
  raw,
  auth,
  redis,
}: StoreArgs): Promise<void> {
  const db = getDb();
  const now = new Date();
  // Plan retention + ownership when this inbox came from the customer API,
  // instance default and public otherwise. Warmed by the caller, so this is a
  // cache read rather than a round trip.
  const policy = await mailboxPolicyFor(mailbox);
  const values = messageValuesFrom(parsed, {
    mailbox,
    raw,
    auth,
    ownerUserId: policy.ownerUserId,
    expiresAt: new Date(now.getTime() + policy.retentionMs),
  });

  const storage = getStorage();
  // Blobs are the slowest part of storing a message and depend on nothing but
  // the parsed mail, so they upload while the row is being written. Only the
  // attachment *rows* need the message id, and those are a single insert.
  // Nothing is awaited between here and the Promise.all below — a gap would
  // leave these rejections unhandled for a tick.
  const uploading = Promise.all(
    parsed.attachments.map(async (a) => {
      const contentType = a.contentType ?? "application/octet-stream";
      const stored = await storage.put(a.content, contentType);
      return {
        filename: a.filename ?? "attachment",
        contentType,
        size: a.size ?? a.content.length,
        content: stored.content,
        storageKey: stored.storageKey,
      };
    }),
  );

  const [inserted, uploaded] = await Promise.all([
    db.insert(messages).values(values).returning(),
    uploading,
  ]);

  const row = inserted[0];
  if (!row) throw new Error("insert returned no row");

  let savedAttachments: { id: string; filename: string; contentType: string; size: number }[] =
    [];
  if (uploaded.length > 0) {
    const attachmentRows: NewAttachmentRow[] = uploaded.map((a) => ({
      ...a,
      messageId: row.id,
    }));
    savedAttachments = await db
      .insert(attachments)
      .values(attachmentRows)
      .returning({
        id: attachments.publicId,
        filename: attachments.filename,
        contentType: attachments.contentType,
        size: attachments.size,
      });
  }

  const message: Message = {
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
    attachments: savedAttachments,
  };

  // Marked, not withheld: the public /ws has no authentication, so it drops
  // private events instead of fanning them out to whoever asked for the address.
  const event: RealtimeEvent = {
    type: "message:new",
    mailbox,
    message,
    ...(policy.ownerUserId !== null ? { private: true as const } : {}),
  };
  await redis.publish(REALTIME_CHANNEL, JSON.stringify(event));

  // Hourly received-message counter for the admin activity chart. Survives the
  // message-purge TTL; the counter itself expires after 48h.
  //
  // Deliberately not awaited: it is two more round trips on a path the sender is
  // blocked on, and a lost tick of a dashboard chart is not worth holding an
  // SMTP connection open for. Losing one is also not worth failing delivery, so
  // it swallows its own errors.
  const hourKey = `stats:rcv:${now.toISOString().slice(0, 13)}`;
  void redis
    .multi()
    .incr(hourKey)
    .expire(hourKey, 172_800)
    .exec()
    .catch((err: unknown) => console.error("[stats] counter failed:", err));
}
