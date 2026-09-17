/**
 * A stored attachment blob. Exactly one of the two fields is populated:
 * - `content` for the "db" driver (kept inline in Postgres bytea)
 * - `storageKey` for the "s3" driver (object key in the bucket)
 */
export interface StoredBlob {
  storageKey: string | null;
  content: Buffer | null;
}

export interface Storage {
  /** Persist a blob and return how to reference it later. */
  put(buffer: Buffer, contentType: string): Promise<StoredBlob>;
  /** Read a blob back into memory. */
  get(blob: StoredBlob): Promise<Buffer>;
  /** Remove an object (no-op for the db driver — rows cascade with the message). */
  del(storageKey: string | null): Promise<void>;
}
