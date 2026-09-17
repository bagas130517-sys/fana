import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PASSWORD_MIN,
  credentialsSchema,
  firstIssue,
  normalizeUsername,
  passwordSchema,
  usernameSchema,
} from "./account.js";

test("usernames are lowercased and trimmed", () => {
  assert.equal(usernameSchema.parse("  Admin  "), "admin");
  assert.equal(normalizeUsername(" OpErAtOr "), "operator");
});

test("usernames reject spaces, symbols and addresses", () => {
  for (const bad of ["ab", "", "has space", "user@domain", "-leading", "üser", "x".repeat(33)]) {
    assert.ok(!usernameSchema.safeParse(bad).success, `expected reject: ${bad}`);
  }
  for (const good of ["admin", "ops.team", "jas_tin", "a1-b2"]) {
    assert.ok(usernameSchema.safeParse(good).success, `expected accept: ${good}`);
  }
});

test("passwords enforce length, not composition theatre", () => {
  assert.ok(!passwordSchema.safeParse("short").success);
  assert.ok(passwordSchema.safeParse("x".repeat(PASSWORD_MIN)).success);
  assert.ok(passwordSchema.safeParse("correct horse battery staple").success);
  assert.ok(!passwordSchema.safeParse("x".repeat(201)).success);
});

test("login credentials only require a non-empty password", () => {
  // The length rule applies when setting a password, not when checking one —
  // an old short password must still be able to sign in.
  assert.ok(credentialsSchema.safeParse({ username: "admin", password: "old" }).success);
  assert.ok(!credentialsSchema.safeParse({ username: "admin", password: "" }).success);
});

test("firstIssue reports the first message", () => {
  const result = usernameSchema.safeParse("a");
  assert.ok(!result.success);
  assert.match(firstIssue(result.error), /at least 3/);
});
