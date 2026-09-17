import { getMailDomains } from "@fana/core";
import { listVerifiedDomains } from "@fana/db";

// Served set = built-in (env) ∪ verified community domains, cached and refreshed
// periodically so onRcptTo (hot path) never blocks on the DB.
const builtins = getMailDomains().map((d) => d.toLowerCase());
let served = new Set(builtins);

export function addressServed(address: string): boolean {
  const domain = address.split("@")[1]?.toLowerCase();
  return domain !== undefined && served.has(domain);
}

export function servedList(): string[] {
  return [...served];
}

export async function refreshDomains(): Promise<void> {
  try {
    const verified = await listVerifiedDomains();
    served = new Set([...builtins, ...verified.map((d) => d.toLowerCase())]);
  } catch (err) {
    console.error("[smtp] domain refresh failed:", err);
  }
}

export function startDomainRefresh(intervalMs = 30_000): () => void {
  const timer = setInterval(() => void refreshDomains(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
