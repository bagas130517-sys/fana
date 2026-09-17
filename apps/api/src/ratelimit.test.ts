import assert from "node:assert/strict";
import test from "node:test";
import { PRIVATE_IP, resolveClient } from "./ratelimit.js";

/**
 * Two ways to be wrong here, and the second is the dangerous one: charge one
 * caller for another's traffic, or hand somebody an unlimited budget by
 * mistaking them for the deployment's own server-side rendering.
 */

test("a direct caller is charged to their socket address", () => {
  assert.deepEqual(resolveClient({ socketAddress: "203.0.113.7" }), {
    key: "203.0.113.7",
    internal: false,
  });
});

test("behind a proxy the forwarded address wins over the socket", () => {
  // The socket is the proxy's; charging it would make every visitor one client.
  const client = resolveClient({
    forwardedFor: "203.0.113.7",
    socketAddress: "172.18.0.4",
  });
  assert.equal(client.key, "203.0.113.7");
  assert.equal(client.internal, false);
});

test("takes the original client from a chain of proxies", () => {
  assert.equal(
    resolveClient({ forwardedFor: "203.0.113.7, 70.41.3.18, 150.172.238.178" }).key,
    "203.0.113.7",
  );
});

test("tolerates the whitespace real proxies emit", () => {
  assert.equal(resolveClient({ forwardedFor: "  203.0.113.7 , 70.41.3.18" }).key, "203.0.113.7");
});

test("falls back to x-real-ip when there is no forwarded-for", () => {
  assert.equal(
    resolveClient({ realIp: "203.0.113.7", socketAddress: "172.18.0.4" }).key,
    "203.0.113.7",
  );
});

test("an empty forwarded header is not an identity", () => {
  const client = resolveClient({ forwardedFor: "   ", socketAddress: "203.0.113.7" });
  assert.equal(client.key, "203.0.113.7");
});

test("a request with nothing to identify it still gets a bucket", () => {
  // Shared, but bounded — better than an unbounded one nobody is charged for.
  assert.deepEqual(resolveClient({}), { key: "unknown", internal: false });
});

test("server-side rendering from inside the deployment is not counted", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "192.168.1.9", "172.18.0.4", "::1", "fd00::1"]) {
    assert.equal(
      resolveClient({ socketAddress: address }).internal,
      true,
      `${address} should be internal`,
    );
  }
});

test("a proxied request is never internal, whatever the socket is", () => {
  // The socket being private just means the proxy is a container neighbour.
  // Skipping on that alone would give everyone behind the proxy no limit at all.
  const client = resolveClient({
    forwardedFor: "203.0.113.7",
    socketAddress: "172.18.0.4",
  });
  assert.equal(client.internal, false);
});

test("public addresses are always counted", () => {
  for (const address of ["203.0.113.7", "8.8.8.8", "2001:db8::1", "100.64.0.1"]) {
    assert.equal(
      resolveClient({ socketAddress: address }).internal,
      false,
      `${address} should be counted`,
    );
  }
});

test("the private range stops where RFC 1918 stops", () => {
  // 172.16.0.0/12 is 172.16–172.31. Widening it by accident would exempt
  // real traffic from rate limiting entirely.
  assert.ok(PRIVATE_IP.test("172.16.0.1"));
  assert.ok(PRIVATE_IP.test("172.31.255.254"));
  assert.ok(!PRIVATE_IP.test("172.15.0.1"));
  assert.ok(!PRIVATE_IP.test("172.32.0.1"));
  assert.ok(!PRIVATE_IP.test("172.320.0.1"));
});

test("addresses that merely start with private digits are not private", () => {
  assert.ok(!PRIVATE_IP.test("100.0.0.1"));
  assert.ok(!PRIVATE_IP.test("127001.0.0.1"));
  assert.ok(!PRIVATE_IP.test("1927.168.0.1"));
});

test("only loopback itself matches ::1, not an address containing it", () => {
  assert.ok(PRIVATE_IP.test("::1"));
  assert.ok(!PRIVATE_IP.test("::1234"));
});

test("link-local IPv6 is not treated as internal", () => {
  // fe80:: is not unique-local; a machine on the same LAN is not this deployment.
  assert.ok(!PRIVATE_IP.test("fe80::1"));
  assert.ok(PRIVATE_IP.test("fc00::1"));
  assert.ok(PRIVATE_IP.test("FD12:3456::1"));
});
