import 'server-only';
import { createHmac, randomBytes } from 'node:crypto';
import { authEnv } from '@/server/env';

/** A random 256-bit token, base64url. Used for session cookies and emailed links. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * HMAC-SHA256 of a token with SESSION_SECRET. Only this is stored, so a database leak cannot be
 * replayed as a login or a reset link (DATABASE_DESIGN §5.2).
 */
export function hashToken(token: string): string {
  return createHmac('sha256', authEnv().SESSION_SECRET).update(token).digest('base64url');
}
