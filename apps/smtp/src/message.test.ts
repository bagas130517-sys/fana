import assert from "node:assert/strict";
import test from "node:test";
import type { ParsedMail } from "mailparser";
import { messageValuesFrom, UNKNOWN_SENDER, type MessageContext } from "./message.js";

/**
 * What we keep of a message, and what we do when a sender leaves something out.
 * Real mail omits headers constantly, and the answer to each omission is a
 * decision — not a default that happens to fall out of the parser.
 */

const CONTEXT: MessageContext = {
  mailbox: "someone@fana.test",
  raw: Buffer.from("raw source"),
  auth: { spf: "pass", dkim: "pass", dmarc: "pass", verdict: "verified" },
  ownerUserId: null,
  expiresAt: new Date("2030-01-01T00:00:00.000Z"),
};

/** Only the fields this module reads; the rest of ParsedMail is irrelevant here. */
function parsed(partial: Partial<ParsedMail>): ParsedMail {
  return { attachments: [], headers: new Map(), ...partial } as unknown as ParsedMail;
}

const from = (address: string, name = "") =>
  ({ value: [{ address, name }] }) as unknown as ParsedMail["from"];

test("keeps the sender address and display name", () => {
  const row = messageValuesFrom(
    parsed({ from: from("noreply@example.org", "Example"), subject: "Hi" }),
    CONTEXT,
  );
  assert.equal(row.fromAddress, "noreply@example.org");
  assert.equal(row.fromName, "Example");
  assert.equal(row.subject, "Hi");
});

test("an empty display name is absence, not an empty name", () => {
  const row = messageValuesFrom(parsed({ from: from("a@b.test", "") }), CONTEXT);
  assert.equal(row.fromName, null);
});

test("mail with no readable From is still stored", () => {
  const row = messageValuesFrom(parsed({}), CONTEXT);
  assert.equal(row.fromAddress, UNKNOWN_SENDER);
  assert.equal(row.fromName, null);
});

test("a missing subject is empty, never null", () => {
  // The column is NOT NULL and the UI renders "(no subject)" from an empty one.
  const row = messageValuesFrom(parsed({ from: from("a@b.test") }), CONTEXT);
  assert.equal(row.subject, "");
});

test("a missing body part is null rather than an empty string", () => {
  const row = messageValuesFrom(parsed({ from: from("a@b.test") }), CONTEXT);
  assert.equal(row.text, null);
  assert.equal(row.html, null);
});

test("HTML is sanitized on the way in", () => {
  const row = messageValuesFrom(
    parsed({
      from: from("a@b.test"),
      html: `<p onclick="steal()">hi</p><script>steal()</script>`,
    }),
    CONTEXT,
  );
  assert.ok(row.html);
  assert.ok(!row.html.includes("<script"), "script survived sanitization");
  assert.ok(!row.html.includes("onclick"), "event handler survived sanitization");
  assert.ok(row.html.includes("hi"), "sanitizing should keep the content");
});

test("mailparser's false for a missing html part is not stored as text", () => {
  // ParsedMail types `html` as `string | false`, and `false` is not markup.
  const row = messageValuesFrom(
    parsed({ from: from("a@b.test"), html: false as unknown as string }),
    CONTEXT,
  );
  assert.equal(row.html, null);
});

test("carries the authentication verdict through unchanged", () => {
  const row = messageValuesFrom(parsed({ from: from("a@b.test") }), {
    ...CONTEXT,
    auth: { spf: "fail", dkim: null, dmarc: "fail", verdict: "suspicious" },
  });
  assert.equal(row.spf, "fail");
  assert.equal(row.dkim, null);
  assert.equal(row.dmarc, "fail");
  assert.equal(row.verdict, "suspicious");
});

test("stamps ownership and expiry from the context, not the mail", () => {
  const row = messageValuesFrom(parsed({ from: from("a@b.test") }), {
    ...CONTEXT,
    ownerUserId: 42,
  });
  assert.equal(row.ownerUserId, 42);
  assert.equal(row.mailbox, "someone@fana.test");
  assert.deepEqual(row.expiresAt, CONTEXT.expiresAt);
});

test("keeps the raw source for view-original and reprocessing", () => {
  const row = messageValuesFrom(parsed({ from: from("a@b.test") }), CONTEXT);
  assert.equal(row.raw?.toString(), "raw source");
});
