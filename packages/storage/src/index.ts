import { createDbStorage } from "./db.js";
import { createS3Storage } from "./s3.js";
import type { Storage } from "./types.js";

export * from "./types.js";

let instance: Storage | undefined;

/** Shared storage backend, selected by STORAGE_DRIVER (db | s3; default db). */
export function getStorage(env: NodeJS.ProcessEnv = process.env): Storage {
  if (!instance) {
    const driver = (env.STORAGE_DRIVER ?? "db").toLowerCase();
    instance = driver === "s3" ? createS3Storage(env) : createDbStorage();
  }
  return instance;
}
