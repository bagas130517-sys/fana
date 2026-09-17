/** Sender-authentication results for an inbound message (from SPF/DKIM/DMARC). */
export interface AuthResults {
  spf: string | null; // pass | fail | softfail | neutral | none | ...
  dkim: string | null; // pass | fail | neutral | none | ...
  dmarc: string | null; // pass | fail | none | ...
}

export type Verdict = "verified" | "unverified" | "suspicious";

const isPass = (v: string | null): boolean => v === "pass";
const isFail = (v: string | null): boolean => v === "fail" || v === "softfail";

/**
 * Collapse SPF/DKIM/DMARC results into a single user-facing verdict:
 * - verified   → at least one mechanism passed
 * - suspicious → a mechanism explicitly failed (and none passed)
 * - unverified → no usable authentication (the common case for random senders)
 */
export function deriveVerdict(a: AuthResults): Verdict {
  if (isPass(a.dkim) || isPass(a.spf) || isPass(a.dmarc)) return "verified";
  if (isFail(a.spf) || isFail(a.dkim) || isFail(a.dmarc)) return "suspicious";
  return "unverified";
}
