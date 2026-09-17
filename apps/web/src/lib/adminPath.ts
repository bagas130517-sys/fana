const API_URL =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000";

/**
 * The dashboard's URL lives in the database (editable in /admin → Access), so
 * the web app can't know it from env. Instead it asks the API whether the first
 * URL segment *is* the dashboard path — a yes/no about a value the visitor
 * already typed, so the answer leaks nothing that visiting the URL wouldn't.
 *
 * Server-only: the check never runs in the browser.
 */

const CACHE_MS = 15_000;
const MAX_ENTRIES = 200;
const answers = new Map<string, { match: boolean; at: number }>();

async function isAdminPath(segment: string): Promise<boolean> {
  const cached = answers.get(segment);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.match;

  let match = false;
  try {
    const res = await fetch(
      `${API_URL}/api/admin-path/check?path=${encodeURIComponent(segment)}`,
      { cache: "no-store", signal: AbortSignal.timeout(2000) },
    );
    if (res.ok) ({ match } = (await res.json()) as { match: boolean });
  } catch {
    // API down: fall through as "not the dashboard" and let the inbox render.
    return false;
  }

  // Bounded so a crawler walking random URLs can't grow this without limit.
  if (answers.size >= MAX_ENTRIES) answers.clear();
  answers.set(segment, { match, at: Date.now() });
  return match;
}

export type Route =
  | { kind: "admin"; basePath: string; section: string | null }
  | { kind: "hidden" }
  | { kind: "inbox" };

/**
 * Decide what a URL is: the dashboard, the default `/admin` after it has been
 * moved (which must 404 like any other missing page), or an inbox.
 */
export async function resolveRoute(slug: string[]): Promise<Route> {
  const [first, second] = slug;
  if (!first) return { kind: "inbox" };

  if (first.length <= 64 && (await isAdminPath(first))) {
    return { kind: "admin", basePath: `/${first}`, section: second ?? null };
  }
  // Only reachable when the dashboard has been moved off the default.
  if (first.toLowerCase() === "admin") return { kind: "hidden" };

  return { kind: "inbox" };
}
