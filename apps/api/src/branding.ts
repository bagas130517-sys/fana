import { eq } from "drizzle-orm";
import { getDb, settings } from "@fana/db";
import {
  brandOverridesSchema,
  compactOverrides,
  resolveBrand,
  type Brand,
  type BrandOverrides,
} from "@fana/core";

const KEY = "branding";
const CACHE_MS = 30_000;

// Branding is read on every page render, so keep it out of the hot path — same
// deal as the served-domain cache. Writes refresh this process immediately;
// other replicas pick the change up within CACHE_MS.
let cache: { overrides: BrandOverrides; at: number } | null = null;

export async function readOverrides(): Promise<BrandOverrides> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.overrides;

  const [row] = await getDb()
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, KEY))
    .limit(1);

  // A row written by an older/newer version is tolerated: unknown or malformed
  // fields are dropped rather than taking the whole instance down.
  const parsed = brandOverridesSchema.safeParse(row?.value ?? {});
  const overrides = parsed.success ? compactOverrides(parsed.data) : {};
  cache = { overrides, at: Date.now() };
  return overrides;
}

export async function writeOverrides(
  overrides: BrandOverrides,
): Promise<BrandOverrides> {
  const value = compactOverrides(overrides);
  await getDb()
    .insert(settings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    });
  cache = { overrides: value, at: Date.now() };
  return value;
}

/** Reset to the built-in theme (hard delete — no soft-delete anywhere). */
export async function clearOverrides(): Promise<void> {
  await getDb().delete(settings).where(eq(settings.key, KEY));
  cache = { overrides: {}, at: Date.now() };
}

/** Effective brand: saved overrides → SITE_NAME → built-in fana theme. */
export async function getBrand(): Promise<Brand> {
  return resolveBrand(await readOverrides());
}
