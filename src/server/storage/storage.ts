import 'server-only';
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { storageEnv, type StorageEnv } from '@/server/env';

/**
 * Cloudflare R2 through its S3-compatible API (SYSTEM_DESIGN §38, ADR-07). The only file that
 * imports the AWS SDK. Photo bytes never pass through the app: the browser PUTs to a signed URL and
 * reads from the public media domain; the server only signs, verifies, copies and deletes.
 *
 * Never call these inside a database transaction (DATABASE_DESIGN §8). Keys come from ./keys.
 */

export class StorageNotConfiguredError extends Error {
  override name = 'StorageNotConfiguredError';
}

/** Signed upload URLs live as long as the upload reservation (API_DESIGN §22.1). */
export const UPLOAD_URL_SECONDS = 60 * 60;

/** DeleteObjects accepts at most 1,000 keys per request. */
const DELETE_BATCH = 1000;

let cached: { identity: string; client: S3Client } | undefined;

function storage(): { config: StorageEnv; client: S3Client } {
  const config = storageEnv();
  if (!config) throw new StorageNotConfiguredError('R2 storage is not configured');
  // One client per account + key; `next dev` may reload .env.local with new values.
  const identity = `${config.R2_ACCOUNT_ID}:${config.R2_ACCESS_KEY_ID}`;
  if (cached?.identity !== identity) {
    cached = {
      identity,
      client: new S3Client({
        region: 'auto',
        endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: config.R2_ACCESS_KEY_ID,
          secretAccessKey: config.R2_SECRET_ACCESS_KEY,
        },
        // R2 rejects the SDK's default CRC32 checksums on presigned PUTs.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      }),
    };
  }
  return { config, client: cached.client };
}

/** Whether R2 is configured, so callers can hide upload controls instead of failing. */
export function storageConfigured(): boolean {
  return storageEnv() !== undefined;
}

/**
 * A presigned PUT for one key, bound to its Content-Type and exact Content-Length: the browser
 * must send both as signed, so it cannot store another type or a larger file.
 */
export async function signUploadUrl(
  key: string,
  contentType: string,
  contentLength: number,
): Promise<string> {
  const { config, client } = storage();
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: config.R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    }),
    { expiresIn: UPLOAD_URL_SECONDS, signableHeaders: new Set(['content-type', 'content-length']) },
  );
}

export type ObjectInfo = { size: number; contentType?: string; etag?: string };

/** Size, type and ETag of a stored object, or undefined when it does not exist. */
export async function headObject(key: string): Promise<ObjectInfo | undefined> {
  const { config, client } = storage();
  try {
    const head = await client.send(
      new HeadObjectCommand({ Bucket: config.R2_BUCKET_NAME, Key: key }),
    );
    return { size: head.ContentLength ?? 0, contentType: head.ContentType, etag: head.ETag };
  } catch (error) {
    if (error instanceof NotFound || error instanceof NoSuchKey) return undefined;
    throw error;
  }
}

/**
 * The first `length` bytes of an object, for checking its format signature (API_DESIGN §22.3), or
 * undefined when it does not exist.
 */
export async function readObjectStart(
  key: string,
  length = 16,
  ifMatch?: string,
): Promise<Uint8Array | undefined> {
  const { config, client } = storage();
  try {
    const result = await client.send(
      new GetObjectCommand({
        Bucket: config.R2_BUCKET_NAME,
        Key: key,
        Range: `bytes=0-${length - 1}`,
        ...(ifMatch ? { IfMatch: ifMatch } : {}),
      }),
    );
    return result.Body ? await result.Body.transformToByteArray() : new Uint8Array();
  } catch (error) {
    if (error instanceof NoSuchKey || error instanceof NotFound) return undefined;
    throw error;
  }
}

/**
 * Copies a verified upload from staging to its final key, with the final Content-Type. With
 * `ifMatch` (the ETag that was verified) the copy fails if the object changed since: the browser
 * could otherwise re-upload through its still-valid URL between verification and copy.
 */
export async function copyObject(
  from: string,
  to: string,
  contentType: string,
  ifMatch?: string,
): Promise<void> {
  const { config, client } = storage();
  await client.send(
    new CopyObjectCommand({
      Bucket: config.R2_BUCKET_NAME,
      CopySource: `${config.R2_BUCKET_NAME}/${encodeURIComponent(from).replaceAll('%2F', '/')}`,
      Key: to,
      ContentType: contentType,
      MetadataDirective: 'REPLACE',
      ...(ifMatch ? { CopySourceIfMatch: ifMatch } : {}),
      // Keys are never reused (fresh key ids), so the content behind a URL never changes.
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
}

/** Deletes objects by key; missing keys are not an error. */
export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const { config, client } = storage();
  for (let start = 0; start < keys.length; start += DELETE_BATCH) {
    const batch = keys.slice(start, start + DELETE_BATCH);
    const result = await client.send(
      new DeleteObjectsCommand({
        Bucket: config.R2_BUCKET_NAME,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    if (result.Errors?.length) {
      throw new Error(`R2 delete failed for ${result.Errors.length} object(s)`);
    }
  }
}

/** Deletes every object under a prefix (a wedding's objects, its staging area). Returns the count. */
export async function deletePrefix(prefix: string): Promise<number> {
  if (!prefix.endsWith('/')) throw new Error('prefix must end with "/"');
  const { config, client } = storage();
  let deleted = 0;
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: config.R2_BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    const keys = (page.Contents ?? []).flatMap((item) => (item.Key ? [item.Key] : []));
    await deleteObjects(keys);
    deleted += keys.length;
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return deleted;
}

/** The public URL of a stored object on the media domain (SYSTEM_DESIGN §42). */
export function publicUrl(key: string): string {
  const config = storageEnv();
  if (!config) throw new StorageNotConfiguredError('R2 storage is not configured');
  return `${config.MEDIA_BASE_URL}/${key.split('/').map(encodeURIComponent).join('/')}`;
}
