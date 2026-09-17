import { Hono } from "hono";
import type Redis from "ioredis";
import { createSession } from "../auth/sessions.js";
import { authorizeUrl, consumeState, fetchProfile, issueState, upsertUser } from "../auth/oauth.js";
import { configuredProviders, getProvider } from "../auth/providers.js";

/**
 * The OAuth dance, one pair of routes for every provider. Unauthenticated by
 * nature, so it sits outside the session guard and shares the sign-in rate
 * limit.
 */
export function oauthRoutes(redis: Redis) {
  const routes = new Hono();

  const webUrl = () =>
    (process.env.PUBLIC_WEB_URL ?? "http://localhost:3000").replace(/\/$/, "");

  /** GET /api/auth/providers — what the sign-in screen should offer. */
  routes.get("/auth/providers", (c) => c.json({ providers: configuredProviders() }));

  /** GET /api/auth/:provider?returnTo=/dashboard */
  routes.get("/auth/:provider", async (c) => {
    const provider = getProvider(c.req.param("provider"));
    if (!provider) {
      return c.json({ error: "That sign-in method isn't configured here" }, 501);
    }

    // Only same-site paths: an open redirect here would be handing out sessions.
    const raw = c.req.query("returnTo") ?? "/dashboard";
    const returnTo = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";

    const state = await issueState(redis, returnTo);
    return c.redirect(authorizeUrl(provider, state));
  });

  /** GET /api/auth/:provider/callback — the provider sends the browser back here. */
  routes.get("/auth/:provider/callback", async (c) => {
    const fail = (reason: string) =>
      c.redirect(`${webUrl()}/dashboard?error=${encodeURIComponent(reason)}`);

    const provider = getProvider(c.req.param("provider"));
    if (!provider) return fail("not_configured");

    const returnTo = await consumeState(redis, c.req.query("state") ?? "");
    if (returnTo === null) return fail("expired");

    const code = c.req.query("code");
    if (!code) return fail("denied");

    const profile = await fetchProfile(provider, code);
    if (!profile) return fail("exchange_failed");

    const user = await upsertUser(provider.id, profile);
    const { token } = await createSession(redis, user);

    // The token rides in the fragment, not the query: fragments are never sent
    // to the server, so it stays out of access logs and Referer headers.
    return c.redirect(`${webUrl()}${returnTo}#token=${encodeURIComponent(token)}`);
  });

  return routes;
}
