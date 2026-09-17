import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { apiTokens, getDb } from "@fana/db";
import { randomToken } from "../secrets.js";

/**
 * Machine token for the REST API (curl, cron, monitoring). High-entropy random,
 * so SHA-256 is the right hash here — unlike a password it needs no stretching,
 * and a fast lookup keeps it usable on every request.
 */

const PREFIX = "fana_";
/** Chars of the token shown in the dashboard so the active one is identifiable. */
const DISPLAY_CHARS = 10;

export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export function generateToken(): { token: string; hash: string; prefix: string } {
  const token = PREFIX + randomToken(32);
  return {
    token,
    hash: hashToken(token),
    prefix: token.slice(0, DISPLAY_CHARS),
  };
}

/** Replace any existing token with a fresh one. Returns the plaintext ONCE. */
export async function rotateApiToken(): Promise<string> {
  const { token, hash, prefix } = generateToken();
  const db = getDb();
  await db.delete(apiTokens);
  await db.insert(apiTokens).values({ tokenHash: hash, prefix });
  return token;
}

export async function getApiTokenInfo(): Promise<
  { prefix: string; createdAt: string; lastUsedAt: string | null } | null
> {
  const [row] = await getDb().select().from(apiTokens).limit(1);
  if (!row) return null;
  return {
    prefix: row.prefix,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

/** True when `token` is the active API token; records the use. */
export async function verifyApiToken(token: string): Promise<boolean> {
  if (!token.startsWith(PREFIX)) return false;
  const db = getDb();
  const [row] = await db
    .select({ id: apiTokens.id, lastUsedAt: apiTokens.lastUsedAt })
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, hashToken(token)))
    .limit(1);
  if (!row) return false;

  // "Last used" is for the dashboard, not an audit log — a write per authorised
  // request would be pure overhead, so only refresh it once a minute.
  const stale =
    !row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000;
  if (stale) {
    await db
      .update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, row.id));
  }
  return true;
}
