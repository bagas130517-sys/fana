import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PLAN,
  planInputSchema,
  planLimitsSchema,
  planSlugSchema,
  usagePeriod,
  withinLimit,
} from "./plans.js";

test("the seeded default plan is itself valid", () => {
  assert.ok(planInputSchema.safeParse(DEFAULT_PLAN).success);
});

test("plan slugs are lowercased and restricted", () => {
  assert.equal(planSlugSchema.parse("  Pro  "), "pro");
  for (const bad of ["p", "-lead", "has space", "sym!bol", "x".repeat(33)]) {
    assert.ok(!planSlugSchema.safeParse(bad).success, `expected reject: ${bad}`);
  }
});

test("limits reject nonsense", () => {
  const base = { monthlyRequests: 10, requestsPerMinute: 5, retentionMinutes: 60, concurrentInboxes: 1 };
  assert.ok(planLimitsSchema.safeParse(base).success);
  assert.ok(!planLimitsSchema.safeParse({ ...base, monthlyRequests: -1 }).success);
  assert.ok(!planLimitsSchema.safeParse({ ...base, retentionMinutes: 0 }).success);
  assert.ok(!planLimitsSchema.safeParse({ ...base, requestsPerMinute: 1.5 }).success);
});

test("zero means unlimited, and the boundary is exclusive", () => {
  assert.ok(withinLimit(1_000_000, 0));
  assert.ok(withinLimit(9, 10));
  assert.ok(!withinLimit(10, 10));
  assert.ok(!withinLimit(11, 10));
});

test("usage periods are UTC calendar months", () => {
  assert.equal(usagePeriod(new Date("2026-07-26T23:59:59Z")), "2026-07");
  assert.equal(usagePeriod(new Date("2026-08-01T00:00:00Z")), "2026-08");
});
