import { z } from "zod";

export * from "./account.js";
export * from "./address.js";
export * from "./extract.js";
export * from "./webhook.js";
export * from "./brand.js";
export * from "./config.js";
export * from "./plans.js";
export * from "./auth.js";

/** A parsed inbound message, normalized for storage + API. */
export const messageSchema = z.object({
  id: z.string().uuid(),
  mailbox: z.string(), // full address, lowercased: user@domain
  fromAddress: z.string(),
  fromName: z.string().nullable(),
  subject: z.string(),
  text: z.string().nullable(),
  html: z.string().nullable(),
  receivedAt: z.string(), // ISO
  expiresAt: z.string(), // ISO
  seen: z.boolean(),
  auth: z.object({
    spf: z.string().nullable(),
    dkim: z.string().nullable(),
    dmarc: z.string().nullable(),
    verdict: z.enum(["verified", "unverified", "suspicious"]),
  }),
  attachments: z.array(
    z.object({
      id: z.string().uuid(),
      filename: z.string(),
      contentType: z.string(),
      size: z.number().int(),
    }),
  ),
  /**
   * Codes and links pulled out of the body — see `extract.ts`. Present when a
   * single message is read and absent from listings: it is a convenience for
   * the message you opened, and running it over a hundred rows nobody looked at
   * would be pure work.
   */
  extracted: z
    .object({ codes: z.array(z.string()), links: z.array(z.string()) })
    .optional(),
});

export type Message = z.infer<typeof messageSchema>;

/**
 * Realtime event pushed over WebSocket + Redis pubsub.
 *
 * `private` marks mail for an inbox minted privately through /v1. The public
 * socket is unauthenticated, so it drops those events rather than delivering
 * them to anyone who names the address.
 */
export type RealtimeEvent =
  | { type: "message:new"; mailbox: string; message: Message; private?: boolean }
  | { type: "message:deleted"; mailbox: string; id: string }
  | { type: "mailbox:purged"; mailbox: string };
