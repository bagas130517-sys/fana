import assert from "node:assert/strict";
import test from "node:test";
import {
  FAILURES_BEFORE_DISABLE,
  MAX_ATTEMPTS,
  SIGNATURE_TOLERANCE_SECONDS,
  backoffMs,
  checkWebhookUrl,
  isPrivateHost,
  signWebhook,
  verifyWebhook,
} from "./webhook.js";

const SECRET = "whsec_test";
const BODY = JSON.stringify({ event: "message.received", id: "abc" });
const NOW = 1_700_000_000;

test("a signature we produce is one a receiver accepts", () => {
  assert.ok(verifyWebhook(SECRET, BODY, signWebhook(SECRET, BODY, NOW), NOW));
});

test("a different secret does not verify", () => {
  const header = signWebhook(SECRET, BODY, NOW);
  assert.equal(verifyWebhook("whsec_other", BODY, header, NOW), false);
});

test("a tampered body does not verify", () => {
  const header = signWebhook(SECRET, BODY, NOW);
  assert.equal(verifyWebhook(SECRET, `${BODY} `, header, NOW), false);
});

test("the timestamp is signed, so it cannot be moved", () => {
  // Take a real signature and claim it was made now: the MAC covers `t`, so
  // rewriting it breaks the digest rather than extending the window.
  const header = signWebhook(SECRET, BODY, NOW - 10_000);
  const moved = header.replace(`t=${NOW - 10_000}`, `t=${NOW}`);
  assert.equal(verifyWebhook(SECRET, BODY, moved, NOW), false);
});

test("a captured request stops working once it is old", () => {
  const header = signWebhook(SECRET, BODY, NOW);
  assert.ok(verifyWebhook(SECRET, BODY, header, NOW + SIGNATURE_TOLERANCE_SECONDS - 1));
  assert.equal(
    verifyWebhook(SECRET, BODY, header, NOW + SIGNATURE_TOLERANCE_SECONDS + 1),
    false,
  );
});

test("a clock a little ahead of ours still verifies", () => {
  const header = signWebhook(SECRET, BODY, NOW + 60);
  assert.ok(verifyWebhook(SECRET, BODY, header, NOW));
});

test("malformed signature headers are refused, not crashed on", () => {
  for (const header of ["", "garbage", "t=abc,v1=xx", `t=${NOW}`, "v1=deadbeef"]) {
    assert.equal(verifyWebhook(SECRET, BODY, header, NOW), false, header);
  }
});

test("backoff grows and then stops growing", () => {
  const delays = Array.from({ length: MAX_ATTEMPTS }, (_, i) => backoffMs(i + 1));
  for (let i = 1; i < delays.length; i++) {
    assert.ok(delays[i]! >= delays[i - 1]!, `attempt ${i + 1} waits less than ${i}`);
  }
  assert.ok(delays[0]! >= 1_000, "the first retry should not be immediate");
  // Past the schedule it holds at the longest delay rather than running off.
  assert.equal(backoffMs(99), delays[delays.length - 1]);
});

test("private and loopback addresses are refused", () => {
  for (const host of [
    "localhost",
    "app.localhost",
    "127.0.0.1",
    "0.0.0.0",
    "10.1.2.3",
    "192.168.1.1",
    "172.16.0.1",
    "172.31.255.1",
    // Cloud metadata — the address this whole check exists for.
    "169.254.169.254",
    "metadata.google.internal",
    "db.internal",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "100.64.0.1",
  ]) {
    assert.ok(isPrivateHost(host), `${host} should be private`);
  }
});

test("public addresses are allowed", () => {
  for (const host of [
    "example.com",
    "hooks.example.com",
    "8.8.8.8",
    "203.0.113.7",
    "172.15.0.1",
    "172.32.0.1",
    "2606:4700::1",
  ]) {
    assert.equal(isPrivateHost(host), false, `${host} should be allowed`);
  }
});

test("a registered URL must be https and public", () => {
  assert.equal(checkWebhookUrl("https://hooks.example.com/mail").ok, true);
  assert.equal(checkWebhookUrl("http://hooks.example.com/mail").ok, false);
  assert.equal(checkWebhookUrl("https://127.0.0.1/mail").ok, false);
  assert.equal(checkWebhookUrl("ftp://example.com").ok, false);
  assert.equal(checkWebhookUrl("not a url").ok, false);
});

test("credentials in the URL are refused", () => {
  // They would be logged and stored in plain text along with the endpoint.
  assert.equal(checkWebhookUrl("https://user:pass@hooks.example.com/x").ok, false);
});

test("local development can opt out of both rules", () => {
  const check = checkWebhookUrl("http://localhost:9000/hook", true);
  assert.equal(check.ok, true);
});

test("an accepted URL comes back normalized", () => {
  const check = checkWebhookUrl("  https://hooks.example.com/mail?x=1  ");
  assert.ok(check.ok);
  assert.equal(check.url, "https://hooks.example.com/mail?x=1");
});

test("the disable threshold is below the point of pointlessness", () => {
  // A dead endpoint should stop being retried while a customer might still fix
  // it, not after days of failures.
  assert.ok(FAILURES_BEFORE_DISABLE >= 3 && FAILURES_BEFORE_DISABLE <= 10);
});
