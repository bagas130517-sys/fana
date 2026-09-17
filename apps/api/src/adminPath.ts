import { eq } from "drizzle-orm";
import { getDb, settings } from "@fana/db";

/**
 * Where the dashboard is served from. Stored in the DB so an operator can move
 * it from `/admin` without a redeploy; `ADMIN_PATH` in env is only the value a
 * fresh instance starts with.
 *
 * The path is a weak secret — it keeps scanners off the sign-in form, nothing
 * more — so it is never returned to an unauthenticated caller. The public
 * endpoint only answers "is this the path?" for a candidate the caller already
 * typed, which reveals no more than visiting the URL would.
 */

const KEY = "admin_path";
const CACHE_MS = 15_000;
const DEFAULT_PATH = "admin";

/** One URL segment: letters, digits, dot, dash, underscore. */
const PATH_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** Paths that would collide with something the app already serves. */
const RESERVED = new Set(["api", "_next", "robots.txt", "favicon.ico", "ws"]);

let cache: { path: string; at: number } | null = null;

export function normalizeAdminPath(input: string): string {
  return input.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
}

export function adminPathError(path: string): string | null {
  if (!PATH_RE.test(path)) {
    return "Use one segment of letters, digits, dot, dash or underscore";
  }
  if (RESERVED.has(path)) return `"${path}" is reserved`;
  return null;
}

function envDefault(): string {
  const fromEnv = normalizeAdminPath(process.env.ADMIN_PATH ?? "");
  return fromEnv && !adminPathError(fromEnv) ? fromEnv : DEFAULT_PATH;
}

export async function getAdminPath(): Promise<string> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.path;

  const [row] = await getDb()
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, KEY))
    .limit(1);

  const stored = normalizeAdminPath(
    (row?.value as { path?: string } | undefined)?.path ?? "",
  );
  const path = stored && !adminPathError(stored) ? stored : envDefault();
  cache = { path, at: Date.now() };
  return path;
}

export async function setAdminPath(path: string): Promise<string> {
  const value = { path };
  await getDb()
    .insert(settings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  cache = { path, at: Date.now() };
  return path;
}

export async function matchesAdminPath(candidate: string): Promise<boolean> {
  return normalizeAdminPath(candidate) === (await getAdminPath());
}
