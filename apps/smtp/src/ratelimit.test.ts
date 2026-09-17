import assert from "node:assert/strict";
import test from "node:test";
import { allowSender, senderKey, type CounterRedis } from "./ratelimit.js";
import { BLOCKLIST_KEY, SENDERS_KEY, screenSender, type ScreenRedis } from "./abuse.js";

/**
 * The flood guard decides whether inbound mail is accepted at all, so both ways
 * of being wrong matter: letting a flood through, and — worse for a mail server
 * — rejecting real mail because Redis had a bad moment.
 */

/** An in-memory stand-in for the counters, plus a record of what was called. */
function fakeRedis(overrides: Partial<ScreenRedis> = {}) {
  const counts = new Map<string, number>();
  const expiries = new Map<string, number>();
  const blocked = new Set<string>();
  const recorded: string[] = [];

  const redis: ScreenRedis = {
    incr: (key) => Promise.resolve(counts.set(key, (counts.get(key) ?? 0) + 1).get(key)!),
    expire: (key, seconds) => Promise.resolve(expiries.set(key, seconds)),
    sismember: (_key, member) => Promise.resolve(blocked.has(member) ? 1 : 0),
    zincrby: (_key, _by, member) => Promise.resolve(recorded.push(member)),
    ...overrides,
  };
  return { redis, counts, expiries, blocked, recorded };
}

const env = (max: string, window = "60") => ({
  SMTP_RATE_LIMIT_MAX: max,
  SMTP_RATE_LIMIT_WINDOW_SECONDS: window,
}) as NodeJS.ProcessEnv;

test("allows exactly up to the limit, then refuses", async () => {
  const { redis } = fakeRedis();
  const verdicts: boolean[] = [];
  for (let i = 0; i < 5; i++) verdicts.push(await allowSender(redis, "1.2.3.4", env("3")));
  assert.deepEqual(verdicts, [true, true, true, false, false]);
});

test("counts each sender separately", async () => {
  const { redis } = fakeRedis();
  assert.equal(await allowSender(redis, "1.1.1.1", env("1")), true);
  assert.equal(await allowSender(redis, "1.1.1.1", env("1")), false);
  assert.equal(await allowSender(redis, "2.2.2.2", env("1")), true);
});

test("sets the window once, on the hit that opens it", async () => {
  const { redis, expiries } = fakeRedis();
  let expireCalls = 0;
  const counting: CounterRedis = {
    incr: redis.incr,
    expire: (k, s) => {
      expireCalls++;
      return redis.expire(k, s);
    },
  };

  for (let i = 0; i < 4; i++) await allowSender(counting, "1.2.3.4", env("10", "90"));

  // Re-expiring on every hit would slide the window and the limit would never
  // be reached by a sender pacing itself.
  assert.equal(expireCalls, 1);
  assert.equal(expiries.get(senderKey("1.2.3.4")), 90);
});

test("is disabled at a limit of zero or below", async () => {
  const { redis, counts } = fakeRedis();
  for (const max of ["0", "-1"]) {
    for (let i = 0; i < 50; i++) {
      assert.equal(await allowSender(redis, "1.2.3.4", env(max)), true);
    }
  }
  assert.equal(counts.size, 0, "a disabled limiter should not touch Redis");
});

test("a nonsense limit disables rather than blocking everything", async () => {
  const { redis } = fakeRedis();
  const broken = { SMTP_RATE_LIMIT_MAX: "not-a-number" } as NodeJS.ProcessEnv;
  assert.equal(await allowSender(redis, "1.2.3.4", broken), true);
});

test("fails open when Redis is down", async () => {
  const { redis } = fakeRedis({
    incr: () => Promise.reject(new Error("connection refused")),
  });
  // A cache outage must not turn into a mail outage.
  assert.equal(await allowSender(redis, "1.2.3.4", env("1")), true);
});

test("screening rejects a blocklisted sender before counting it", async () => {
  const { redis, blocked, counts } = fakeRedis();
  blocked.add("9.9.9.9");

  const err = await screenSender(redis, "9.9.9.9", env("30"));
  assert.match(err?.message ?? "", /^554 /);
  assert.equal(counts.size, 0, "a blocked sender should not consume its own budget");
});

test("screening rejects a flooding sender with a retryable code", async () => {
  const { redis } = fakeRedis();
  assert.equal(await screenSender(redis, "1.2.3.4", env("1")), null);

  const err = await screenSender(redis, "1.2.3.4", env("1"));
  // 4xx, so the sender queues and retries instead of giving up on the mail.
  assert.match(err?.message ?? "", /^451 /);
});

test("screening records an accepted sender for the admin view", async () => {
  const { redis, recorded } = fakeRedis();
  assert.equal(await screenSender(redis, "1.2.3.4", env("30")), null);
  assert.deepEqual(recorded, ["1.2.3.4"]);
});

test("screening fails open when Redis is down", async () => {
  const { redis } = fakeRedis({
    sismember: () => Promise.reject(new Error("connection refused")),
  });
  assert.equal(await screenSender(redis, "1.2.3.4", env("30")), null);
});

test("the keys screening reads are the ones the admin API writes", () => {
  // These names are a contract with /api/admin/block and /api/admin/abuse; a
  // rename on one side alone silently stops blocking anyone.
  assert.equal(BLOCKLIST_KEY, "smtp:blocklist");
  assert.equal(SENDERS_KEY, "stats:senders");
  assert.equal(senderKey("1.2.3.4"), "smtp:rl:1.2.3.4");
});
