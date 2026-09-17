/**
 * OAuth providers, as data. Every provider is the same authorization-code flow
 * and differs only in two endpoints, a scope string and how the profile comes
 * back — so a provider is a table entry here, not a route of its own.
 *
 * Only GitHub is defined today. Adding Google or Discord later means appending
 * one object below and setting `<ID>_CLIENT_ID` / `<ID>_CLIENT_SECRET`; nothing
 * in the routes, the session layer or the `identities` table has to change.
 */

export interface OAuthProfile {
  providerUserId: string;
  username: string;
  email: string | null;
  name: string | null;
}

export interface OAuthProvider {
  id: string;
  label: string;
  authorizeEndpoint: string;
  tokenEndpoint: string;
  scope: string;
  /** Turn an access token into the fields we store. Null if the call fails. */
  profile(accessToken: string): Promise<OAuthProfile | null>;
}

const json = async <T>(res: Response): Promise<T | null> =>
  res.ok ? ((await res.json().catch(() => null)) as T | null) : null;

const github: OAuthProvider = {
  id: "github",
  label: "GitHub",
  authorizeEndpoint: "https://github.com/login/oauth/authorize",
  tokenEndpoint: "https://github.com/login/oauth/access_token",
  scope: "read:user user:email",
  async profile(accessToken) {
    const headers = {
      authorization: `Bearer ${accessToken}`,
      accept: "application/vnd.github+json",
      "user-agent": "fana",
    };

    const user = await json<{
      id: number;
      login: string;
      name: string | null;
      email: string | null;
    }>(await fetch("https://api.github.com/user", { headers }));
    if (!user) return null;

    // The profile email is null unless the account made it public, so ask for
    // the verified primary one separately.
    let email = user.email;
    if (!email) {
      const emails = await json<{ email: string; primary: boolean; verified: boolean }[]>(
        await fetch("https://api.github.com/user/emails", { headers }),
      );
      email = emails?.find((e) => e.primary && e.verified)?.email ?? null;
    }

    return {
      providerUserId: String(user.id),
      username: user.login.toLowerCase(),
      email,
      name: user.name,
    };
  },
};

const REGISTRY: Record<string, OAuthProvider> = { github };

/** Credentials live under the provider's own prefix: GITHUB_CLIENT_ID, … */
export function credentials(id: string): { clientId?: string; clientSecret?: string } {
  const prefix = id.toUpperCase();
  return {
    clientId: process.env[`${prefix}_CLIENT_ID`],
    clientSecret: process.env[`${prefix}_CLIENT_SECRET`],
  };
}

export function isConfigured(id: string): boolean {
  const { clientId, clientSecret } = credentials(id);
  return Boolean(clientId && clientSecret);
}

/** A provider is only usable once its credentials are set. */
export function getProvider(id: string): OAuthProvider | null {
  const provider = REGISTRY[id];
  return provider && isConfigured(id) ? provider : null;
}

/** Providers this instance can actually sign people in with. */
export function configuredProviders(): { id: string; label: string }[] {
  return Object.values(REGISTRY)
    .filter((p) => isConfigured(p.id))
    .map((p) => ({ id: p.id, label: p.label }));
}
