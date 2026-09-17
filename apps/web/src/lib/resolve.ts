import { isValidLocalPart } from "./validate";

/**
 * Resolve a URL path (the [[...slug]] segments) into what inbox to show:
 *
 *   /                    → root      (restore saved or mint random)
 *   /domain.com          → randomOn  (random local on that served domain)
 *   /domain.com/alias    → address   (alias@domain.com)
 *   /alias@domain.com    → address   (alias@domain.com)
 *   /alias               → address   (alias@<default domain>)
 *
 * Explicit `address` results are public and used directly (no reservation).
 * Anything malformed falls back to `root`.
 */
export type Resolved =
  | { kind: "root" }
  | { kind: "randomOn"; domain: string }
  | { kind: "address"; address: string };

export function resolveSlug(slug: string[], domains: string[]): Resolved {
  const defaultDomain = domains[0];
  if (!defaultDomain || slug.length === 0) return { kind: "root" };

  const seg = slug.map((s) => decodeURIComponent(s).trim().toLowerCase());

  if (seg.length === 1) {
    const one = seg[0]!;
    if (one.includes("@")) {
      const [local = "", domain = ""] = one.split("@");
      if (isValidLocalPart(local) && domains.includes(domain)) {
        return { kind: "address", address: `${local}@${domain}` };
      }
      return { kind: "root" };
    }
    if (domains.includes(one)) return { kind: "randomOn", domain: one };
    if (isValidLocalPart(one)) return { kind: "address", address: `${one}@${defaultDomain}` };
    return { kind: "root" };
  }

  if (seg.length === 2) {
    const [domain = "", local = ""] = seg;
    if (domains.includes(domain) && isValidLocalPart(local)) {
      return { kind: "address", address: `${local}@${domain}` };
    }
  }
  return { kind: "root" };
}
