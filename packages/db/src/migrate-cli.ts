import { runMigrations } from "./migrate.js";

// Entry point for `pnpm db:migrate`.
await runMigrations();
process.exit(0);
