import { login } from '@/modules/auth';
import { loginSchema } from '@/modules/auth/schemas';
import { sessionCookie } from '@/server/auth/session-cookie';
import { clientIp, handler, readJson } from '@/server/http/route';

/** POST /api/auth/login (API_DESIGN §10). */
export const POST = handler('/api/auth/login', async (req) => {
  const input = await readJson(req, loginSchema);
  const { me, token } = await login(input, clientIp(req));
  return Response.json(me, { status: 200, headers: { 'Set-Cookie': sessionCookie(token) } });
});
