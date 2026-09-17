import assert from "node:assert/strict";
import test from "node:test";
import { extractFromMessage, htmlToText } from "./extract.js";

/**
 * Heuristics are only as good as the mail they were tried against, so these
 * cases are shaped like the real thing: a code near a word that names it, and
 * a body full of numbers that are not codes.
 */

const codesOf = (m: Parameters<typeof extractFromMessage>[0]) =>
  extractFromMessage(m).codes;
const linksOf = (m: Parameters<typeof extractFromMessage>[0]) =>
  extractFromMessage(m).links;

test("finds a six-digit code next to the word code", () => {
  assert.deepEqual(
    codesOf({ text: "Your verification code is 483920. It expires in 10 minutes." }),
    ["483920"],
  );
});

test("finds codes of every length senders actually use", () => {
  for (const code of ["1234", "48392", "483920", "4839201", "48392017"]) {
    assert.deepEqual(codesOf({ text: `Your login code: ${code}` }), [code], code);
  }
});

test("finds a code in the subject alone", () => {
  assert.deepEqual(
    codesOf({ subject: "918273 is your OTP", text: "Welcome back." }),
    ["918273"],
  );
});

test("finds an alphanumeric code", () => {
  assert.deepEqual(codesOf({ text: "Enter passcode G2Q4B7 to continue." }), ["G2Q4B7"]);
});

test("reads Indonesian too", () => {
  assert.deepEqual(codesOf({ text: "Kode verifikasi kamu adalah 224466." }), ["224466"]);
});

test("prefers the code a keyword points at over other numbers", () => {
  const codes = codesOf({
    text: "Order 88991122 shipped. Your confirmation code is 445566.",
  });
  assert.equal(codes[0], "445566");
});

test("returns nothing when no number is called a code", () => {
  assert.deepEqual(
    codesOf({ text: "Your parcel arrives Tuesday. 4 items, 2039 High Street." }),
    [],
  );
});

test("ignores a copyright year", () => {
  assert.deepEqual(codesOf({ text: "© 2026 Example Inc. All rights reserved." }), []);
});

test("ignores digits inside a tracking link", () => {
  assert.deepEqual(
    codesOf({
      text: "Confirm here: https://track.example.com/c/998877/aa11 — thanks!",
    }),
    [],
  );
});

test("does not pick a code out of a phone number or a price", () => {
  assert.deepEqual(codesOf({ text: "Call 555-2034-1188 or pay 1200.5000 now." }), []);
});

test("falls back to the HTML body when there is no text part", () => {
  assert.deepEqual(
    codesOf({
      html: "<p>Your code is <b>135790</b></p><style>.a{width:123456px}</style>",
    }),
    ["135790"],
  );
});

test("does not read a code out of a stylesheet", () => {
  assert.deepEqual(
    codesOf({ html: "<style>.x{padding:445566px}</style><p>Hello there</p>" }),
    [],
  );
});

test("deduplicates a code repeated in subject and body", () => {
  assert.deepEqual(
    codesOf({ subject: "112233 is your code", text: "Your code is 112233." }),
    ["112233"],
  );
});

test("caps how many candidates come back", () => {
  const text =
    "verification code 111111 222222 333333 444444 555555 666666 777777 888888";
  assert.equal(codesOf({ text }).length, 5);
});

test("takes links from anchors in document order", () => {
  assert.deepEqual(
    linksOf({
      html: `<a href="https://example.com/verify?t=1">Verify</a> and <a href="https://example.com/help">help</a>`,
    }),
    ["https://example.com/verify?t=1", "https://example.com/help"],
  );
});

test("decodes entities in a href", () => {
  assert.deepEqual(
    linksOf({ html: `<a href="https://example.com/v?a=1&amp;b=2">Verify</a>` }),
    ["https://example.com/v?a=1&b=2"],
  );
});

test("takes links out of plain text without the trailing punctuation", () => {
  assert.deepEqual(linksOf({ text: "Confirm at https://example.com/go/abc." }), [
    "https://example.com/go/abc",
  ]);
});

test("keeps only http(s) links", () => {
  assert.deepEqual(
    linksOf({
      html: `<a href="mailto:a@b.test">mail</a><a href="tel:+15551234">call</a><a href="https://example.com/ok">ok</a>`,
    }),
    ["https://example.com/ok"],
  );
});

test("deduplicates a link that appears in both parts", () => {
  assert.deepEqual(
    linksOf({
      html: `<a href="https://example.com/go">Go</a>`,
      text: "Go: https://example.com/go",
    }),
    ["https://example.com/go"],
  );
});

test("an empty message extracts to empty lists", () => {
  assert.deepEqual(extractFromMessage({}), { codes: [], links: [] });
});

test("htmlToText turns block ends into line breaks", () => {
  assert.match(htmlToText("<p>one</p><p>two</p>"), /one\s*\n\s*two/);
});
