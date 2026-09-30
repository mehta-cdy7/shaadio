import { logout } from '@/modules/auth';
import { emptySchema } from '@/modules/auth/schemas';
import { clearedSessionCookie, readSessionToken } from '@/server/auth/session-cookie';
import { handler, readJson } from '@/server/http/route';

/** POST /api/auth/logout (API_DESIGN §10). 204 whether or not a session existed. */
export const POST = handler('/api/auth/logout', async (req) => {
  await readJson(req, emptySchema);
  await logout(readSessionToken(req.headers.get('cookie')));
  return new Response(null, { status: 204, headers: { 'Set-Cookie': clearedSessionCookie() } });
});
