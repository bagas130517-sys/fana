import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveVerdict } from "./auth.js";

test("verified when any mechanism passes", () => {
  assert.equal(deriveVerdict({ spf: "pass", dkim: "none", dmarc: "none" }), "verified");
  assert.equal(deriveVerdict({ spf: "none", dkim: "pass", dmarc: "none" }), "verified");
  assert.equal(deriveVerdict({ spf: "fail", dkim: "pass", dmarc: "none" }), "verified");
});

test("suspicious when a mechanism fails and none pass", () => {
  assert.equal(deriveVerdict({ spf: "fail", dkim: "none", dmarc: "none" }), "suspicious");
  assert.equal(deriveVerdict({ spf: "softfail", dkim: "none", dmarc: "none" }), "suspicious");
  assert.equal(deriveVerdict({ spf: "none", dkim: "none", dmarc: "fail" }), "suspicious");
});

test("unverified when nothing passes or fails", () => {
  assert.equal(deriveVerdict({ spf: "none", dkim: "none", dmarc: "none" }), "unverified");
  assert.equal(deriveVerdict({ spf: "neutral", dkim: null, dmarc: null }), "unverified");
  assert.equal(deriveVerdict({ spf: null, dkim: null, dmarc: null }), "unverified");
});
