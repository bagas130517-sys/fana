import { resolveBrand, type Brand } from "@fana/core/brand";

export type { Brand };

// Server-side calls stay inside the deploy (e.g. http://api:4000 in compose);
// NEXT_PUBLIC_API_URL is the browser-facing one and works for local dev.
const API_URL =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000";

/**
 * Where this instance is served from, for anything that needs an absolute URL:
 * the sitemap, and the `og:image` a link preview has to fetch. Trailing slash
 * trimmed so callers can join with `/path` without doubling it.
 */
export function siteUrl(): string {
  return (process.env.PUBLIC_WEB_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

const CACHE_MS = 5_000;
let cache: { brand: Brand; at: number } | null = null;

/**
 * Branding for the current request: whatever an operator saved in `/admin`,
 * falling back to `SITE_NAME` and then the built-in theme. Fetched from the API
 * (which owns the DB) and memoized briefly so a page render doesn't add a round
 * trip per component. Server-only — client components use `useBrand()`.
 */
export async function getBrand(): Promise<Brand> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.brand;

  try {
    const res = await fetch(`${API_URL}/api/branding`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) throw new Error(`branding ${res.status}`);
    const { brand } = (await res.json()) as { brand: Brand };
    cache = { brand, at: Date.now() };
    return brand;
  } catch {
    // The API being down shouldn't blank the page — render the local fallback
    // and retry on the next request rather than caching the failure.
    return resolveBrand({});
  }
}
