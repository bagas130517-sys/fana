import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidLocalPart,
  normalizeAddress,
  randomAddress,
  randomLocalPart,
} from "./address.js";
import { isServedAddress } from "./config.js";

test("randomLocalPart yields valid parts in all three styles", () => {
  const styles = {
    adjNounNum: /^[a-z]+-[a-z]+-\d{6}$/,
    nounToken: /^[a-z]+-[a-z0-9]{5}$/,
    token: /^[a-z0-9]{7}$/,
  };
  const seen = new Set<string>();
  for (let i = 0; i < 400; i++) {
    const local = randomLocalPart();
    assert.ok(isValidLocalPart(local), `invalid: ${local}`);
    const match = Object.entries(styles).find(([, re]) => re.test(local));
    assert.ok(match, `no style matched: ${local}`);
    seen.add(match![0]);
  }
  // Over 400 draws all three styles should appear (P(miss) ~ (2/3)^400).
  assert.deepEqual([...seen].sort(), ["adjNounNum", "nounToken", "token"]);
});

test("randomAddress is on the given domain and served", () => {
  const addr = randomAddress("Mail.Example.com");
  assert.ok(addr.endsWith("@mail.example.com"));
  assert.ok(isServedAddress(addr, ["mail.example.com"]));
});

test("isValidLocalPart rejects bad input", () => {
  assert.ok(isValidLocalPart("hello.world_1"));
  assert.ok(!isValidLocalPart(".leading"));
  assert.ok(!isValidLocalPart("has space"));
  assert.ok(!isValidLocalPart("with@at"));
});

test("normalizeAddress lowercases and trims", () => {
  assert.equal(normalizeAddress("  Foo@Bar.COM "), "foo@bar.com");
});

test("isServedAddress only matches configured domains", () => {
  const domains = ["a.com", "b.com"];
  assert.ok(isServedAddress("x@a.com", domains));
  assert.ok(!isServedAddress("x@c.com", domains));
  assert.ok(!isServedAddress("invalid", domains));
});

test("draws do not repeat in bulk", () => {
  // Each style is tuned to ~1e9+ combinations, so 20k draws should not collide.
  // A duplicate here means the entropy claim in address.ts is no longer true —
  // the reservation table would still catch it, at the cost of a retry per hit.
  const seen = new Set<string>();
  for (let i = 0; i < 20_000; i++) seen.add(randomLocalPart());
  assert.equal(seen.size, 20_000);
});

test("no character of the token alphabet dominates", () => {
  // Not a uniformity proof — a sanity bound. `pick` uses a byte modulo the list
  // length, which is very slightly biased (256 % 31 leaves 8 characters one
  // extra chance in 256, a ratio of 1.125); anything near 1.4 means the
  // generator has actually broken, not that the bias grew.
  const counts = new Map<string, number>();
  let total = 0;
  for (let i = 0; i < 4_000; i++) {
    // The bare-token style is the one that is all alphabet, no words.
    const local = randomLocalPart();
    if (!/^[a-z0-9]{7}$/.test(local)) continue;
    for (const ch of local) {
      counts.set(ch, (counts.get(ch) ?? 0) + 1);
      total++;
    }
  }

  assert.ok(total > 5_000, `too few samples to judge: ${total}`);
  const expected = total / counts.size;
  for (const [ch, n] of counts) {
    assert.ok(n < expected * 1.4, `'${ch}' appeared ${n} times, expected ~${expected.toFixed(0)}`);
    assert.ok(n > expected * 0.6, `'${ch}' appeared ${n} times, expected ~${expected.toFixed(0)}`);
  }
  // Ambiguous characters are left out on purpose: these get read off a screen
  // and typed into a signup form.
  for (const ch of "01oli") assert.ok(!counts.has(ch), `'${ch}' should not be generated`);
});

test("isValidLocalPart holds the length the address column expects", () => {
  assert.ok(isValidLocalPart("a"));
  assert.ok(isValidLocalPart("a".repeat(64)));
  assert.ok(!isValidLocalPart("a".repeat(65)));
  assert.ok(!isValidLocalPart(""));
});

test("isValidLocalPart rejects edges that break address parsing", () => {
  assert.ok(!isValidLocalPart("trailing."));
  assert.ok(!isValidLocalPart("trailing-"));
  assert.ok(!isValidLocalPart("-leading"));
  assert.ok(!isValidLocalPart("two@ats@here"));
  assert.ok(!isValidLocalPart("quote'd"));
  assert.ok(!isValidLocalPart("semi;colon"));
  // Case is normalized before the check, so a typed alias is accepted as typed.
  assert.ok(isValidLocalPart("MixedCase"));
});

test("randomAddress lowercases the domain it is given", () => {
  const addr = randomAddress("MiXeD.Example.COM");
  assert.ok(addr.endsWith("@mixed.example.com"), addr);
  assert.ok(isValidLocalPart(addr.split("@")[0]!));
});

test("normalizeAddress leaves an already-normal address alone", () => {
  assert.equal(normalizeAddress("foo@bar.com"), "foo@bar.com");
});
