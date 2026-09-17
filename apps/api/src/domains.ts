import { getMailDomains } from "@fana/core";
import { listVerifiedDomainDetails } from "@fana/db";

// Served set = built-in (env) ∪ verified community domains. Cached in memory and
// refreshed periodically so the hot request path doesn't hit the DB every call.
const builtins = getMailDomains().map((d) => d.toLowerCase());

/** What the public API tells clients about a domain it serves. */
export interface ServedDomain {
  domain: string;
  builtin: boolean;
  /** When it started accepting mail; null for built-ins, which always have. */
  activeSince: string | null;
}

const builtinEntries = (): [string, ServedDomain][] =>
  builtins.map((d) => [d, { domain: d, builtin: true, activeSince: null }]);

let served = new Map<string, ServedDomain>(builtinEntries());

export function isBuiltin(domain: string): boolean {
  return builtins.includes(domain.toLowerCase());
}

export function isServed(domain: string): boolean {
  return served.has(domain.toLowerCase());
}

export function isServedAddress(address: string): boolean {
  const domain = address.split("@")[1]?.toLowerCase();
  return domain !== undefined && served.has(domain);
}

export function servedList(): string[] {
  return [...served.keys()];
}

export function servedDetails(): ServedDomain[] {
  return [...served.values()];
}

export async function refreshDomains(): Promise<void> {
  try {
    const verified = await listVerifiedDomainDetails();
    const next = new Map<string, ServedDomain>(builtinEntries());
    for (const row of verified) {
      const domain = row.domain.toLowerCase();
      // A built-in that also has a row keeps its built-in status.
      if (next.has(domain)) continue;
      next.set(domain, {
        domain,
        builtin: false,
        activeSince: row.verifiedAt?.toISOString() ?? null,
      });
    }
    served = next;
  } catch (err) {
    console.error("[api] domain refresh failed:", err);
  }
}

export function startDomainRefresh(intervalMs = 30_000): () => void {
  const timer = setInterval(() => void refreshDomains(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
