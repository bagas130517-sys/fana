import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { getPgConfig } from "./config.js";

/**
 * Apply any pending SQL migrations from packages/db/drizzle. Idempotent: already
 * -applied migrations are skipped (tracked in the __drizzle_migrations table).
 * Uses a dedicated single connection so it can run standalone or at app startup.
 */
export async function runMigrations(): Promise<void> {
  const cfg = getPgConfig();
  const sql = postgres({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    username: cfg.user,
    password: cfg.password,
    ssl: cfg.ssl,
    max: 1,
  });
  try {
    const db = drizzle(sql);
    const folder = fileURLToPath(new URL("../drizzle", import.meta.url));
    await migrate(db, { migrationsFolder: folder });
    console.log("[migrate] database up to date");
  } finally {
    await sql.end();
  }
}
