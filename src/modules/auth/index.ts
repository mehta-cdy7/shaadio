import 'server-only';
import { readSessionToken, sessionCookie } from '@/server/auth/session-cookie';
import { AppError } from '@/server/http/errors';
import type { RequestMeta } from '@/server/http/route';
import { resolveSession, type SessionUser } from './auth.service';

export { login, logout, resolveSession, signup } from './auth.service';
export type { AuthResult, SessionUser } from './auth.service';

export type UserCtx = SessionUser & RequestMeta;

/**
 * Route wrapper for endpoints that need a signed-in user but no wedding (API_DESIGN §10).
 * No or expired session → 401 UNAUTHENTICATED. `withMember` builds on this once memberships exist.
 */
export function withUser(
  fn: (req: Request, ctx: UserCtx) => Promise<Response>,
): (req: Request, meta: RequestMeta) => Promise<Response> {
  return async (req, meta) => {
    const token = readSessionToken(req.headers.get('cookie'));
    const session = await resolveSession(token);
    if (!session) throw new AppError('UNAUTHENTICATED', 'Please sign in.');

    const res = await fn(req, { ...session, ...meta });
    if (session.refreshed && token) res.headers.append('Set-Cookie', sessionCookie(token));
    return res;
  };
}
