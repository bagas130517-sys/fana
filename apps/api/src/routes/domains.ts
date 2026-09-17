import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb, domains as domainsTable } from "@fana/db";
import { isBuiltin, isServed, servedDetails, servedList } from "../domains.js";
import { DOMAIN_RE, instructions, verifyAndMark } from "../mx.js";

export const domainRoutes = new Hono();

/**
 * GET /api/domains — domains this instance currently serves.
 * `details` carries how long each has been accepting mail, which the inbox
 * shows next to the live indicator; `domains` stays for simple clients.
 */
domainRoutes.get("/domains", (c) =>
  c.json({ domains: servedList(), details: servedDetails() }),
);

/** POST /api/domains { domain } — register a community domain and try to verify it. */
domainRoutes.post("/domains", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { domain?: string } | null;
  const domain = body?.domain?.trim().toLowerCase();
  if (!domain || !DOMAIN_RE.test(domain)) {
    return c.json({ error: "Enter a valid domain, e.g. mail.yoursite.com" }, 400);
  }
  if (isBuiltin(domain)) {
    return c.json({ error: "That domain is already built in" }, 409);
  }

  const db = getDb();
  await db.insert(domainsTable).values({ domain }).onConflictDoNothing();

  const verified = await verifyAndMark(domain);
  return c.json({ domain, verified, ...instructions(domain) });
});

/** POST /api/domains/:domain/verify — re-check MX for a pending domain. */
domainRoutes.post("/domains/:domain/verify", async (c) => {
  const domain = c.req.param("domain").trim().toLowerCase();
  if (!DOMAIN_RE.test(domain)) return c.json({ error: "Invalid domain" }, 400);

  const db = getDb();
  const [row] = await db
    .select()
    .from(domainsTable)
    .where(eq(domainsTable.domain, domain))
    .limit(1);
  if (!row) return c.json({ error: "Domain not found — add it first" }, 404);

  if (isServed(domain)) return c.json({ domain, verified: true });

  const verified = await verifyAndMark(domain);
  return c.json({ domain, verified, ...instructions(domain) });
});
