import { promises as dns } from "node:dns";
import { eq } from "drizzle-orm";
import { getDb, domains as domainsTable } from "@fana/db";
import { refreshDomains } from "./domains.js";

export const MX_HOST = (process.env.PUBLIC_MX_HOST ?? "").toLowerCase().replace(/\.$/, "");
// "mx" verifies the domain's MX points at us; "off" auto-verifies (local/dev).
export const VERIFY_MODE = (process.env.DOMAIN_VERIFY ?? "mx").toLowerCase();

// A plausible registrable domain: 2+ dot-separated labels, letters/digits/hyphens.
export const DOMAIN_RE =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/** True if the domain's MX record points at this instance (or verify is off). */
export async function mxPointsHere(domain: string): Promise<boolean> {
  if (VERIFY_MODE === "off") return true;
  if (!MX_HOST) return false;
  try {
    const records = await dns.resolveMx(domain);
    return records.some(
      (r) => r.exchange.toLowerCase().replace(/\.$/, "") === MX_HOST,
    );
  } catch {
    return false;
  }
}

/** Re-check MX; mark the domain verified + refresh the cache if it now points here. */
export async function verifyAndMark(domain: string): Promise<boolean> {
  const verified = await mxPointsHere(domain);
  if (verified) {
    await getDb()
      .update(domainsTable)
      .set({ verified: true, verifiedAt: new Date() })
      .where(eq(domainsTable.domain, domain));
    await refreshDomains();
  }
  return verified;
}

export function instructions(domain: string) {
  return {
    mxHost: MX_HOST || null,
    steps:
      VERIFY_MODE === "off"
        ? ["Verification is disabled on this instance — the domain is active."]
        : [
            `Add an MX record to ${domain}:`,
            `  type MX · priority 1 · value ${MX_HOST || "<not configured>"}`,
            "DNS can take a few minutes to a day to propagate, then re-check.",
          ],
  };
}
