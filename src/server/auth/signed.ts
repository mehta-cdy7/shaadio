import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { authEnv } from '@/server/env';

/**
 * Short-lived signed values (API_DESIGN §23 cover tickets): `base64url(JSON).signature`, HMAC-SHA256
 * with SESSION_SECRET under a purpose label, so a value signed for one purpose never verifies for
 * another. Replaces a database row when the server only needs to trust what it issued.
 */
function sign(purpose: string, body: string): string {
  return createHmac('sha256', authEnv().SESSION_SECRET)
    .update(`${purpose}.${body}`)
    .digest('base64url');
}

export function signValue(purpose: string, value: object, expiresAt: Date): string {
  const body = Buffer.from(JSON.stringify({ ...value, exp: expiresAt.getTime() })).toString(
    'base64url',
  );
  return `${body}.${sign(purpose, body)}`;
}

/** The signed value, or undefined when it is malformed, forged, for another purpose or expired. */
export function verifyValue<T extends object>(
  purpose: string,
  signed: string,
  now = new Date(),
): T | undefined {
  const [body, signature, extra] = signed.split('.');
  if (!body || !signature || extra !== undefined) return undefined;
  const expected = Buffer.from(sign(purpose, body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return undefined;
  try {
    const value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & {
      exp?: unknown;
    };
    if (typeof value.exp !== 'number' || value.exp < now.getTime()) return undefined;
    return value;
  } catch {
    return undefined;
  }
}
