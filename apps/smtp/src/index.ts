import { SMTPServer, type SMTPServerAddress, type SMTPServerSession } from "smtp-server";
import { simpleParser } from "mailparser";
import Redis from "ioredis";
import { normalizeAddress } from "@fana/core";

import { storeMessage } from "./store.js";
import { authenticateMessage } from "./auth.js";
import { mailboxPolicyFor } from "./policy.js";
import { screenSender } from "./abuse.js";
import {
  addressServed,
  refreshDomains,
  servedList,
  startDomainRefresh,
} from "./domains.js";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

const server = new SMTPServer({
  // Inbound MX server: no auth, receive only, never relay.
  authOptional: true,
  disabledCommands: ["AUTH", "STARTTLS"],
  size: Number(process.env.SMTP_MAX_SIZE ?? "10485760"),
  banner: "fana",

  // smtp-server resolves the client's PTR record *before* sending the 220
  // greeting, capped at 1.5s — so every sender pays for it and one with no PTR
  // pays the ceiling. Nothing here uses the result: SPF wants the HELO name the
  // client announced, and abuse screening works on the IP. Set
  // SMTP_REVERSE_LOOKUP=true to put it back.
  disableReverseLookup: process.env.SMTP_REVERSE_LOOKUP !== "true",

  onMailFrom(_address, session, callback) {
    // Screen by IP: blocklist → flood limit → record. One check per message.
    screenSender(redis, session.remoteAddress)
      .then((err) => callback(err ?? undefined))
      .catch(() => callback());
  },

  onRcptTo(address: SMTPServerAddress, _session, callback) {
    // Reject anything not addressed to a domain we serve (built-in or community).
    if (!addressServed(address.address)) {
      return callback(new Error("550 Relay denied: unknown recipient domain"));
    }
    callback();
  },

  onData(stream, session, callback) {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => {
      void handleMessage(Buffer.concat(chunks), session)
        .then(() => callback())
        .catch((err: unknown) => {
          console.error("[smtp] failed to handle message:", err);
          callback(new Error("451 Temporary failure, try again later"));
        });
    });
    stream.on("error", (err) => {
      console.error("[smtp] stream error:", err);
    });
  },
});

async function handleMessage(raw: Buffer, session: SMTPServerSession): Promise<void> {
  const started = performance.now();
  const served = session.envelope.rcptTo
    .map((r: SMTPServerAddress) => normalizeAddress(r.address))
    .filter((addr: string) => addressServed(addr));

  // Parsing, authentication and the per-mailbox policy lookup need nothing from
  // each other — only the raw message and the envelope, both of which are
  // already here. Run them together: the sender is holding the connection open
  // until this returns, and the DNS in authentication dominates the rest.
  const [parsed, auth] = await Promise.all([
    simpleParser(raw),
    // Once per message — the result is the same for every recipient.
    authenticateMessage(raw, session),
    // Not read here: this warms the cache the store then reads synchronously.
    ...served.map((mailbox: string) => mailboxPolicyFor(mailbox)),
  ]);

  // Fan out one stored copy per served recipient (handles multi-RCPT).
  await Promise.all(
    served.map((mailbox: string) => storeMessage({ mailbox, parsed, raw, auth, redis })),
  );
  console.log(
    `[smtp] stored message for ${served.length} recipient(s) in ` +
      `${Math.round(performance.now() - started)}ms: ${served.join(", ")}`,
  );
}

const port = Number(process.env.SMTP_PORT ?? "25");
const host = process.env.SMTP_HOST ?? "0.0.0.0";

// Warm the served-domain cache before accepting mail, then keep it fresh.
await refreshDomains();
const stopDomainRefresh = startDomainRefresh();

server.on("error", (err) => console.error("[smtp] server error:", err));
server.listen(port, host, () => {
  console.log(
    `[smtp] listening on ${host}:${port} for domains: ${servedList().join(", ")}`,
  );
});

function shutdown() {
  console.log("[smtp] shutting down");
  stopDomainRefresh();
  server.close(() => {
    void redis.quit().finally(() => process.exit(0));
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
