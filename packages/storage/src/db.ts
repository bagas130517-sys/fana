import type { Storage, StoredBlob } from "./types.js";

/** Default driver: blobs live inline in the Postgres `attachments.content` column. */
export function createDbStorage(): Storage {
  return {
    async put(buffer: Buffer): Promise<StoredBlob> {
      return { storageKey: null, content: buffer };
    },
    async get(blob: StoredBlob): Promise<Buffer> {
      if (!blob.content) throw new Error("blob has no inline content");
      return blob.content;
    },
    async del(): Promise<void> {
      // Nothing to do — the attachment row (and its bytea) cascades on delete.
    },
  };
}
