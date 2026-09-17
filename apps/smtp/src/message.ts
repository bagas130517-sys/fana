import type { NewMessageRow } from "@fana/db";
import type { AuthResults, Verdict } from "@fana/core";
import { sanitizeEmailHtml } from "@fana/core/sanitize";
import type { ParsedMail } from "mailparser";

/**
 * Parsed mail → the row we store.
 *
 * `mailparser` decides what a message *is*; this decides what we keep of it,
 * which is where the decisions worth testing live: what a message with no From
 * header becomes, when a display name is a name and when it is nothing, and the
 * fact that HTML is sanitized here rather than at every point it is rendered.
 *
 * Pure on purpose — it was inline in `storeMessage`, between a database call
 * and a Redis publish, and so could only be exercised by sending real mail.
 */

/** Everything the row needs that the message itself doesn't say. */
export interface MessageContext {
  /** Normalized recipient address. */
  mailbox: string;
  raw: Buffer;
  auth: AuthResults & { verdict: Verdict };
  /** Non-null only for a private inbox — see `policy.ts`. */
  ownerUserId: number | null;
  expiresAt: Date;
}

/** A From we could not read at all. Stored, not dropped: the body still matters. */
export const UNKNOWN_SENDER = "unknown@unknown";

export function messageValuesFrom(
  parsed: ParsedMail,
  { mailbox, raw, auth, ownerUserId, expiresAt }: MessageContext,
): NewMessageRow {
  const from = parsed.from?.value[0];

  return {
    mailbox,
    fromAddress: from?.address ?? UNKNOWN_SENDER,
    // An empty display name is absence, not an empty name — senders routinely
    // emit `From: <a@b.test>` and `From: "" <a@b.test>` for the same thing.
    fromName: from?.name || null,
    subject: parsed.subject ?? "",
    text: parsed.text ?? null,
    // Sanitized at ingestion so every consumer (API + web) gets safe markup, and
    // so nothing downstream has to remember to do it.
    html: typeof parsed.html === "string" ? sanitizeEmailHtml(parsed.html) : null,
    raw,
    spf: auth.spf,
    dkim: auth.dkim,
    dmarc: auth.dmarc,
    verdict: auth.verdict,
    ownerUserId,
    expiresAt,
  };
}
