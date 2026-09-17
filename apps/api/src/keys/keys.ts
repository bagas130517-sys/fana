import { createHash } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { apiKeys, getDb, plans, users, type ApiKeyRow, type PlanRow } from "@fana/db";
import { DEFAULT_PLAN, type PlanInput } from "@fana/core";
import { randomToken } from "../secrets.js";

/**
 * Customer keys for the /v1 API. High-entropy random, so SHA-256 is the right
 * hash: unlike a password it needs no stretching, and a fast lookup keeps it
 * usable on every request. The plaintext exists once, at creation.
 */

const PREFIX = "fk_";
const DISPLAY_CHARS = 11;

export type KeyWithPlan = { key: ApiKeyRow; plan: PlanRow };

export const hashKey = (key: string) =>
  createHash("sha256").update(key).digest("hex");

export function generateKey(): { key: string; hash: string; prefix: string } {
  const key = PREFIX + randomToken(32);
  return { key, hash: hashKey(key), prefix: key.slice(0, DISPLAY_CHARS) };
}


/** The plan a brand-new account starts on: the first one configured. */
export async function defaultPlanId(): Promise<number> {
  const [plan] = await getDb().select({ id: plans.id }).from(plans).orderBy(plans.id).limit(1);
  if (!plan) throw new Error("no plan configured");
  return plan.id;
}

/** Ensure the instance has at least the free plan to hand keys out on. */
export async function seedPlans(): Promise<void> {
  const db = getDb();
  const [existing] = await db.select({ n: count() }).from(plans);
  if ((existing?.n ?? 0) > 0) return;
  await db.insert(plans).values(DEFAULT_PLAN);
  console.log(`[plans] seeded default plan "${DEFAULT_PLAN.slug}"`);
}

export async function listPlans(): Promise<PlanRow[]> {
  return getDb().select().from(plans).orderBy(plans.createdAt);
}

export async function createPlan(input: PlanInput): Promise<PlanRow | undefined> {
  const [row] = await getDb().insert(plans).values(input).returning();
  return row;
}

export async function updatePlan(
  slug: string,
  input: Partial<PlanInput>,
): Promise<PlanRow | undefined> {
  const [row] = await getDb()
    .update(plans)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(plans.slug, slug))
    .returning();
  return row;
}

/** Refuses to remove a plan accounts are still on — they'd be left without one. */
export async function deletePlan(slug: string): Promise<{ ok: boolean; inUse?: number }> {
  const db = getDb();
  const [plan] = await db.select().from(plans).where(eq(plans.slug, slug)).limit(1);
  if (!plan) return { ok: false };

  const [used] = await db
    .select({ n: count() })
    .from(users)
    .where(eq(users.planId, plan.id));
  if ((used?.n ?? 0) > 0) return { ok: false, inUse: used?.n ?? 0 };

  await db.delete(plans).where(eq(plans.id, plan.id));
  return { ok: true };
}

/** Keys carry no plan of their own — they inherit the owner's. */
export async function createKey(input: {
  userId: number;
  label: string;
}): Promise<{ key: string; row: ApiKeyRow } | { error: string }> {
  const db = getDb();
  const { key, hash, prefix } = generateKey();
  const [row] = await db
    .insert(apiKeys)
    .values({
      userId: input.userId,
      label: input.label,
      keyHash: hash,
      prefix,
    })
    .returning();
  return row ? { key, row } : { error: "Could not create the key" };
}

/** Resolve a presented key to its row + plan. Null when unknown. */
export async function resolveKey(presented: string): Promise<KeyWithPlan | null> {
  if (!presented.startsWith(PREFIX)) return null;

  // The plan comes from the owner: quota and retention are what the account
  // subscribed to, not a property of whichever key was used.
  const [found] = await getDb()
    .select({ key: apiKeys, plan: plans, ownerId: users.id })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .innerJoin(plans, eq(users.planId, plans.id))
    .where(eq(apiKeys.keyHash, hashKey(presented)))
    .limit(1);
  if (!found) return null;

  // "Last used" is for the dashboard, not an audit log — a write per authorised
  // request would be pure overhead, so only refresh it once a minute.
  const stale =
    !found.key.lastUsedAt || Date.now() - found.key.lastUsedAt.getTime() > 60_000;
  if (stale) {
    await getDb()
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, found.key.id));
  }
  return found;
}
