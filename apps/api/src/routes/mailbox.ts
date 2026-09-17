import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { and, desc, eq, gt } from "drizzle-orm";
import { getDb, messages, reservations, type Database } from "@fana/db";
import { deleteMessagesWhere } from "../blobs.js";
import { serializeMessages } from "../serialize.js";
import { publicOnly } from "../visibility.js";
import { isServed, isServedAddress, servedList } from "../domains.js";
import { normalizeAddress, randomAddress, reservationTtlMs } from "@fana/core";

// Keyless, so `publicOnly` everywhere: private mail belongs to the account whose
// key minted the inbox and is reachable through /v1 with that key — never from
// here, whatever address is asked for.
export const mailboxRoutes = new Hono();

/** Claim an address if free. Returns true on success, false if already taken. */
async function tryReserve(db: Database, address: string, token: string): Promise<boolean> {
  const expiresAt = new Date(Date.now() + reservationTtlMs());
  const inserted = await db
    .insert(reservations)
    .values({ address, token, expiresAt })
    .onConflictDoNothing()
    .returning({ address: reservations.address });
  return inserted.length > 0;
}

/**
 * POST /api/mailbox/random?domain= — mint + reserve a RANDOM address, returning
 * a secret token the client stores to reclaim it later. Reserving prevents the
 * generator handing the same address to two clients at once.
 *
 * Explicit addresses (typed or from a URL like /alias@domain) are NOT minted
 * here — they are public and used directly by the client; reads stay public.
 */
mailboxRoutes.post("/mailbox/random", async (c) => {
  // No domain asked for? Spread the load — and the fingerprint — across every
  // domain this instance serves instead of always handing out the first one.
  const served = servedList();
  const requested =
    c.req.query("domain") ?? served[Math.floor(Math.random() * served.length)]!;
  const domain = normalizeAddress(requested);
  if (!isServed(domain)) {
    return c.json({ error: "Unknown domain" }, 400);
  }
  const db = getDb();
  const token = randomUUID();

  for (let i = 0; i < 6; i++) {
    const address = randomAddress(domain);
    if (await tryReserve(db, address, token)) return c.json({ address, token });
  }
  return c.json({ error: "Could not allocate an address, try again" }, 503);
});

/**
 * POST /api/mailbox/claim { address, token } — renew a reservation on return.
 * Matching token → renewed. Held by someone else → { taken: true }. Free
 * (expired + purged) → re-claimed with the caller's token.
 */
mailboxRoutes.post("/mailbox/claim", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    address?: string;
    token?: string;
  } | null;
  if (!body?.address || !body?.token) {
    return c.json({ error: "address and token are required" }, 400);
  }
  const address = normalizeAddress(body.address);
  const token = body.token;
  if (!isServedAddress(address)) {
    return c.json({ error: "Unknown mailbox domain" }, 400);
  }

  const db = getDb();
  const expiresAt = new Date(Date.now() + reservationTtlMs());
  const [existing] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.address, address))
    .limit(1);

  if (existing) {
    if (existing.token !== token) return c.json({ ok: false, taken: true });
    await db
      .update(reservations)
      .set({ expiresAt })
      .where(eq(reservations.address, address));
    return c.json({ ok: true, address });
  }

  // Free again — reclaim with the caller's token (lose the race → taken).
  const reclaimed = await tryReserve(db, address, token);
  return reclaimed
    ? c.json({ ok: true, address, reclaimed: true })
    : c.json({ ok: false, taken: true });
});

/** GET /api/mailbox/:address/messages — list non-expired messages, newest first. */
mailboxRoutes.get("/mailbox/:address/messages", async (c) => {
  const address = normalizeAddress(c.req.param("address"));
  if (!isServedAddress(address)) {
    return c.json({ error: "Unknown mailbox domain" }, 400);
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(eq(messages.mailbox, address), gt(messages.expiresAt, new Date()), publicOnly),
    )
    .orderBy(desc(messages.createdAt))
    .limit(100);

  return c.json({ messages: await serializeMessages(rows) });
});

/** POST /api/mailbox/:address/read — mark every message in the mailbox as seen. */
mailboxRoutes.post("/mailbox/:address/read", async (c) => {
  const address = normalizeAddress(c.req.param("address"));
  if (!isServedAddress(address)) {
    return c.json({ error: "Unknown mailbox domain" }, 400);
  }
  const db = getDb();
  await db
    .update(messages)
    .set({ seen: true })
    .where(and(eq(messages.mailbox, address), publicOnly));
  return c.json({ ok: true });
});

/** DELETE /api/mailbox/:address — purge all messages for a mailbox. */
mailboxRoutes.delete("/mailbox/:address", async (c) => {
  const address = normalizeAddress(c.req.param("address"));
  if (!isServedAddress(address)) {
    return c.json({ error: "Unknown mailbox domain" }, 400);
  }
  await deleteMessagesWhere(and(eq(messages.mailbox, address), publicOnly)!);
  return c.json({ ok: true });
});
