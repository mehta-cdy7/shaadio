import 'server-only';
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { COMMON_PASSWORDS } from './common-passwords';

/**
 * Password hashing with Node's built-in scrypt (SYSTEM_DESIGN §9, ADR-04): an established,
 * memory-hard algorithm, and no native dependency to build on Vercel. Parameters follow the OWASP
 * minimum (N=2^17, r=8, p=1) and are stored in the hash, so they can be raised later without
 * breaking existing hashes.
 *
 * Format: scrypt$<N>$<r>$<p>$<salt base64url>$<key base64url>
 */
const PARAMS = { N: 2 ** 17, r: 8, p: 1 } as const;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

function derive(password: string, salt: Buffer, params: { N: number; r: number; p: number }) {
  const options: ScryptOptions = { ...params, maxmem: 256 * params.N * params.r };
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize('NFC'), salt, KEY_LENGTH, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, PARAMS);
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

/** Constant-time comparison. A malformed stored hash verifies as false, never throws. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [N, r, p] = parts.slice(1, 4).map(Number) as [number, number, number];
  if (![N, r, p].every(Number.isSafeInteger)) return false;
  const salt = Buffer.from(parts[4]!, 'base64url');
  const expected = Buffer.from(parts[5]!, 'base64url');
  const actual = await derive(password, salt, { N, r, p });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | undefined;

/**
 * Runs a full verification against a throwaway hash, so a login with an unknown email takes as
 * long as one with a wrong password (API_DESIGN §10).
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword(newDummySecret());
  await verifyPassword(password, await dummyHash);
  return false;
}

function newDummySecret(): string {
  return randomBytes(16).toString('base64url');
}

/** Case-insensitive check against a short list of the most common passwords (API_DESIGN §10). */
export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}
