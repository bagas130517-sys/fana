export interface PgConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

/** Build Postgres connection settings from discrete DB_* env vars. */
export function getPgConfig(env: NodeJS.ProcessEnv = process.env): PgConfig {
  return {
    host: env.DB_HOST ?? "localhost",
    port: Number(env.DB_PORT ?? "5432"),
    database: env.DB_NAME ?? "fana",
    user: env.DB_USER ?? "fana",
    password: env.DB_PASSWORD ?? "fana",
    ssl: (env.DB_SSL ?? "false").toLowerCase() === "true",
  };
}
