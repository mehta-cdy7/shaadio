import { signup } from '@/modules/auth';
import { signupSchema } from '@/modules/auth/schemas';
import { sessionCookie } from '@/server/auth/session-cookie';
import { clientIp, handler, readJson } from '@/server/http/route';

/** POST /api/auth/signup (API_DESIGN §10). */
export const POST = handler('/api/auth/signup', async (req) => {
  const input = await readJson(req, signupSchema);
  const { me, token } = await signup(input, clientIp(req));
  return Response.json(me, { status: 201, headers: { 'Set-Cookie': sessionCookie(token) } });
});
