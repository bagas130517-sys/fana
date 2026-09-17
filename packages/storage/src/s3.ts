import { randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import type { Storage, StoredBlob } from "./types.js";

/**
 * S3-compatible driver — works with AWS S3, Cloudflare R2, and MinIO. Blobs go
 * to a bucket; the DB keeps only the object key. Configure via S3_* env vars.
 */
export function createS3Storage(env: NodeJS.ProcessEnv = process.env): Storage {
  const bucket = env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");

  const hasCreds = Boolean(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);
  const client = new S3Client({
    region: env.S3_REGION ?? "us-east-1",
    endpoint: env.S3_ENDPOINT || undefined, // set for R2/MinIO; omit for AWS
    forcePathStyle: (env.S3_FORCE_PATH_STYLE ?? "false").toLowerCase() === "true",
    credentials: hasCreds
      ? {
          accessKeyId: env.S3_ACCESS_KEY_ID as string,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY as string,
        }
      : undefined,
  });

  return {
    async put(buffer: Buffer, contentType: string): Promise<StoredBlob> {
      const key = `att/${randomUUID()}`;
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }),
      );
      return { storageKey: key, content: null };
    },
    async get(blob: StoredBlob): Promise<Buffer> {
      if (!blob.storageKey) throw new Error("blob has no storageKey");
      const res = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: blob.storageKey }),
      );
      if (!res.Body) throw new Error("empty S3 object");
      return Buffer.from(await res.Body.transformToByteArray());
    },
    async del(storageKey: string | null): Promise<void> {
      if (!storageKey) return;
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }));
    },
  };
}
