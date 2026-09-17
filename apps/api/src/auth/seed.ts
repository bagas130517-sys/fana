import { count, eq } from "drizzle-orm";
import { apiTokens, getDb, users } from "@fana/db";
import { normalizeUsername, usernameSchema } from "@fana/core";
import { hashPassword } from "./passwords.js";
import { rotateApiToken } from "./tokens.js";
import { defaultPlanId } from "../keys/keys.js";
import { randomToken } from "../secrets.js";

/**
 * First-boot bootstrap. Creates one admin and one API token when the instance
 * has none, and prints the credentials once — the same "grab it from the logs"
 * flow other self-hosted apps use. Nothing here is stored in env: `.env` never
 * holds a live secret, and a leaked deploy file can't hand over the dashboard.
 */

function banner(lines: string[]): void {
  const width = Math.max(...lines.map((l) => l.length)) + 2;
  const rule = "─".repeat(width);
  console.log(`\n┌${rule}┐`);
  for (const line of lines) console.log(`│ ${line.padEnd(width - 1)}│`);
  console.log(`└${rule}┘\n`);
}

export async function seedAuth(): Promise<void> {
  const db = getDb();

  const [adminCount] = await db
    .select({ n: count() })
    .from(users)
    .where(eq(users.role, "admin"));
  if ((adminCount?.n ?? 0) === 0) {
    // ADMIN_USERNAME / ADMIN_PASSWORD are an optional convenience for scripted
    // installs; without them we generate a password and print it once.
    const parsed = usernameSchema.safeParse(process.env.ADMIN_USERNAME ?? "admin");
    const username = parsed.success ? parsed.data : "admin";
    const password =
      process.env.ADMIN_PASSWORD?.trim() || randomToken(20);

    await db.insert(users).values({
      role: "admin",
      planId: await defaultPlanId(),
      username: normalizeUsername(username),
      passwordHash: await hashPassword(password),
    });

    banner([
      "Admin account created — this is shown once.",
      "",
      `  username: ${username}`,
      `  password: ${password}`,
      "",
      "Sign in at /admin and change the password.",
    ]);
  }

  const [tokenCount] = await db.select({ n: count() }).from(apiTokens);
  if ((tokenCount?.n ?? 0) === 0) {
    const token = await rotateApiToken();
    banner([
      "API token created — this is shown once.",
      "",
      `  ${token}`,
      "",
      "Use it as: Authorization: Bearer <token>",
      "Lost it? Generate a new one in /admin → Access.",
    ]);
  }
}
