import 'server-only';
import { randomBytes } from 'node:crypto';

/**
 * R2 object keys (DATABASE_DESIGN §5.12 "Object keys"). Every object that belongs to a wedding
 * lives under `weddings/{weddingId}/` (deletable by prefix) or `staging/{weddingId}/` (expired by
 * the cleanup job and an R2 lifecycle rule).
 */

/** A fresh 128-bit key id, never an ObjectId: object URLs must be unguessable (SYSTEM §42). */
export function newKeyId(): string {
  return randomBytes(16).toString('base64url');
}

function segment(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid storage key segment');
  return value;
}

/** Final keys for a published photo: display image and thumbnail. */
export function photoKeys(weddingId: string, keyId: string) {
  const base = `weddings/${segment(weddingId)}/photos/${segment(keyId)}`;
  return { display: `${base}/d.webp`, thumb: `${base}/t.webp` };
}

/** Wedding and event covers live apart from photos, so photo retention leaves them alone. */
export function coverKey(weddingId: string, keyId: string): string {
  return `weddings/${segment(weddingId)}/covers/${segment(keyId)}.webp`;
}

/** Where the browser uploads before the server has verified the bytes. */
export function stagingKeys(weddingId: string, keyId: string) {
  const base = `staging/${segment(weddingId)}/${segment(keyId)}`;
  return { display: `${base}/d`, thumb: `${base}/t` };
}

/** Everything a wedding owns, for deletion by prefix. */
export function weddingPrefix(weddingId: string): string {
  return `weddings/${segment(weddingId)}/`;
}

export function stagingPrefix(weddingId: string): string {
  return `staging/${segment(weddingId)}/`;
}
