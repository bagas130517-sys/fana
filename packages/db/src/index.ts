import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getPgConfig } from "./config.js";
import * as schema from "./schema.js";
import { domains } from "./schema.js";

export * from "./schema.js";
export * from "./config.js";
export { runMigrations } from "./migrate.js";
export { schema };

let client: postgres.Sql | undefined;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | undefined;

/** Lazily-created shared Drizzle client, configured from DB_* env vars. */
export function getDb(env: NodeJS.ProcessEnv = process.env) {
  if (!dbInstance) {
    const cfg = getPgConfig(env);
    client = postgres({
      host: cfg.host,
      port: cfg.port,
      database: cfg.database,
      username: cfg.user,
      password: cfg.password,
      ssl: cfg.ssl,
      max: 10,
    });
    dbInstance = drizzle(client, { schema });
  }
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  await client?.end();
  client = undefined;
  dbInstance = undefined;
}

export type Database = ReturnType<typeof getDb>;

/** All community domains that have been verified (MX points at this instance). */
export async function listVerifiedDomains(): Promise<string[]> {
  const rows = await getDb()
    .select({ domain: domains.domain })
    .from(domains)
    .where(eq(domains.verified, true));
  return rows.map((r) => r.domain);
}

/** Verified community domains with the moment they started accepting mail. */
export async function listVerifiedDomainDetails(): Promise<
  { domain: string; verifiedAt: Date | null }[]
> {
  return getDb()
    .select({ domain: domains.domain, verifiedAt: domains.verifiedAt })
    .from(domains)
    .where(eq(domains.verified, true));
}
