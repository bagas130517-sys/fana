import { createHash } from "node:crypto";
import type Redis from "ioredis";
import { eq } from "drizzle-orm";
import { getDb, identities, users } from "@fana/db";
import { randomToken } from "../secrets.js";
import { defaultPlanId } from "../keys/keys.js";
import { credentials, type OAuthProfile, type OAuthProvider } from "./providers.js";

/**
 * The provider-independent half of signing in: state, the code exchange, and
 * turning a profile into an account. Customers arrive this way, which is why
 * the product needs no outbound email — no verification link, no password
 * reset, nothing to deliver. Operators keep the password path, because a
 * self-hosted instance may have no OAuth app at all.
 */

const STATE_TTL_SECONDS = 600;
const stateKey = (state: string) => `oauth:state:${state}`;

/** Where the provider sends the browser back. Must match the app's setting. */
export function callbackUrl(providerId: string): string {
  const base = (process.env.PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
  return `${base}/api/auth/${providerId}/callback`;
}

/**
 * A single-use state parameter, held in Redis with the path to return to.
 * Without it, an attacker can hand a victim a callback URL and log them into
 * the attacker's account.
 */
export async function issueState(redis: Redis, returnTo: string): Promise<string> {
  const state = randomToken(24);
  await redis.set(stateKey(state), returnTo, "EX", STATE_TTL_SECONDS);
  return state;
}

export async function consumeState(redis: Redis, state: string): Promise<string | null> {
  if (!state) return null;
  const key = stateKey(state);
  const returnTo = await redis.get(key);
  await redis.del(key); // single use, even if the rest fails
  return returnTo;
}

export function authorizeUrl(provider: OAuthProvider, state: string): string {
  const params = new URLSearchParams({
    client_id: credentials(provider.id).clientId ?? "",
    redirect_uri: callbackUrl(provider.id),
    scope: provider.scope,
    state,
    response_type: "code",
  });
  return `${provider.authorizeEndpoint}?${params}`;
}

/** Exchange the callback code for a profile. Null when the provider refuses. */
export async function fetchProfile(
  provider: OAuthProvider,
  code: string,
): Promise<OAuthProfile | null> {
  const { clientId, clientSecret } = credentials(provider.id);

  const res = await fetch(provider.tokenEndpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId ?? "",
      client_secret: clientSecret ?? "",
      code,
      redirect_uri: callbackUrl(provider.id),
      grant_type: "authorization_code",
    }),
  });

  const token = (await res.json().catch(() => null)) as { access_token?: string } | null;
  if (!token?.access_token) return null;

  return provider.profile(token.access_token);
}

/**
 * Find or create the account behind a profile. Matching is by provider id, not
 * email: an account can change its email, and trusting that would let someone
 * claim an existing account by setting theirs to match.
 */
export async function upsertUser(
  providerId: string,
  profile: OAuthProfile,
): Promise<{ id: number; username: string; role: string }> {
  const db = getDb();

  const [existing] = await db
    .select({ user: users })
    .from(identities)
    .innerJoin(users, eq(identities.userId, users.id))
    .where(eq(identities.providerUserId, profile.providerUserId))
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({ lastLoginAt: new Date(), email: profile.email ?? existing.user.email })
      .where(eq(users.id, existing.user.id));
    return existing.user;
  }

  // Usernames are unique across operators and customers, so a login that
  // collides with an existing name gets a suffix rather than the account.
  let username = profile.username;
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (taken) {
    const suffix = createHash("sha256")
      .update(`${providerId}:${profile.providerUserId}`)
      .digest("hex")
      .slice(0, 6);
    username = `${username}-${suffix}`;
  }

  const [created] = await db
    .insert(users)
    .values({
      username,
      email: profile.email,
      name: profile.name,
      role: "customer",
      planId: await defaultPlanId(),
      lastLoginAt: new Date(),
    })
    .returning({ id: users.id, username: users.username, role: users.role });
  if (!created) throw new Error("could not create user");

  await db.insert(identities).values({
    userId: created.id,
    provider: providerId,
    providerUserId: profile.providerUserId,
    email: profile.email,
  });

  return created;
}
