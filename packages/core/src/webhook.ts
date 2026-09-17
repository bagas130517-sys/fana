import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The parts of webhook delivery that are decisions rather than plumbing: how a
 * receiver knows the request is ours, how long to wait before trying again, and
 * whether a URL is safe to send to at all.
 *
 * Pure and server-only — `node:crypto` keeps this out of a browser bundle,
 * which is right: nothing in here belongs on a page.
 */

/** Attempts before a delivery is abandoned. */
export const MAX_ATTEMPTS = 6;

/** Consecutive failed deliveries before an endpoint is switched off. */
export const FAILURES_BEFORE_DISABLE = 5;

/** A signature older than this is refused by the receiver, so replays expire. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

/**
 * Backoff between attempts. Roughly: seconds, a minute, minutes, then hours —
 * long enough that an endpoint down for a deploy still gets its delivery, short
 * enough that a transient blip is retried while anyone still cares.
 */
const SCHEDULE_MS = [
  10_000, // 10s
  60_000, // 1m
  300_000, // 5m
  1_800_000, // 30m
  7_200_000, // 2h
];

export function backoffMs(attempt: number): number {
  const index = Math.max(0, Math.min(SCHEDULE_MS.length - 1, attempt - 1));
  return SCHEDULE_MS[index]!;
}

/**
 * `t=<unix seconds>,v1=<hex hmac>` over `<t>.<body>`, the shape Stripe made
 * conventional. The timestamp is signed too, so a captured request cannot be
 * replayed once it falls outside the receiver's tolerance.
 */
export function signWebhook(secret: string, body: string, atSeconds: number): string {
  const mac = createHmac("sha256", secret)
    .update(`${atSeconds}.${body}`)
    .digest("hex");
  return `t=${atSeconds},v1=${mac}`;
}

/**
 * The check a receiver runs. Exported because it is the thing customers have to
 * reimplement, and having it here means the docs can describe something that is
 * actually tested rather than something written from memory.
 */
export function verifyWebhook(
  secret: string,
  body: string,
  header: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  const parts = Object.fromEntries(
    header
      .split(",")
      .map((p) => p.trim().split("="))
      .filter((p): p is [string, string] => p.length === 2),
  );
  const t = Number(parts.t);
  const presented = parts.v1;
  if (!Number.isFinite(t) || !presented) return false;
  if (Math.abs(nowSeconds - t) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  // Same length by construction, but compare in constant time anyway — the
  // whole point of the header is that guessing it must not be possible.
  if (expected.length !== presented.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(presented));
}

/**
 * Addresses a customer-supplied URL must not reach. A webhook takes a URL from
 * one user and makes the server fetch it, which is a request forgery primitive
 * unless something says no: cloud metadata endpoints and the instance's own
 * private network are both one POST away otherwise.
 */
const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

const PRIVATE_V4 =
  /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

/** True when a literal IP (or an obvious name) points somewhere internal. */
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(h) || h.endsWith(".localhost") || h.endsWith(".internal")) {
    return true;
  }
  if (PRIVATE_V4.test(h)) return true;
  // IPv6 loopback, unique-local and link-local.
  if (h === "::1" || h === "::" || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h)) {
    return true;
  }
  // IPv4 mapped into IPv6 — ::ffff:127.0.0.1 reaches loopback just as well.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h);
  return mapped ? PRIVATE_V4.test(mapped[1]!) : false;
}

export type UrlCheck = { ok: true; url: string } | { ok: false; reason: string };

/**
 * Validate an endpoint at the moment it is registered. `allowPrivate` exists
 * for local development, where the only endpoint anyone has is on this machine.
 *
 * This checks the *literal* host. A name that resolves to a private address
 * gets past it, so the deliverer resolves and checks again before connecting —
 * see `apps/api/src/webhooks/deliver.ts`.
 */
export function checkWebhookUrl(raw: string, allowPrivate = false): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "Enter a full URL, including https://" };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "Only http and https URLs can be called" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "Credentials in the URL are not accepted" };
  }
  if (!allowPrivate && url.protocol !== "https:") {
    return { ok: false, reason: "Use https — the payload contains your mail" };
  }
  if (!allowPrivate && isPrivateHost(url.hostname)) {
    return { ok: false, reason: "That address is not reachable from this service" };
  }
  return { ok: true, url: url.toString() };
}
