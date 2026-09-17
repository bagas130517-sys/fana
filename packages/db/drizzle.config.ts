import { defineConfig } from "drizzle-kit";

// NOTE: drizzle-kit transpiles only this file, not its imports, so the DB_* env
// reading is inlined here (kept in sync with packages/db/src/config.ts). Defaults
// match the docker-compose datastore; export DB_* to point elsewhere.
// We assemble a URL because drizzle-kit's object form rejects an empty password
// (common with local trust-auth Postgres) while the URL form allows it.
const env = process.env;
const host = env.DB_HOST ?? "localhost";
const port = env.DB_PORT ?? "5432";
const user = env.DB_USER ?? "fana";
const password = env.DB_PASSWORD ?? "fana";
const database = env.DB_NAME ?? "fana";
const ssl = (env.DB_SSL ?? "false").toLowerCase() === "true";

const auth = password ? `${user}:${encodeURIComponent(password)}` : user;
const url = `postgresql://${auth}@${host}:${port}/${database}${ssl ? "?sslmode=require" : ""}`;

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
});
