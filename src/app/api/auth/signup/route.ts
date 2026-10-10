import { signup } from '@/modules/auth';
import { signupSchema } from '@/modules/auth/schemas';
import { acceptInvitationInTransaction } from '@/modules/members';
import { meWeddingFields } from '@/modules/weddings';
import { sessionCookie } from '@/server/auth/session-cookie';
import { clientIp, handler, readJson } from '@/server/http/route';

/**
 * POST /api/auth/signup (API_DESIGN §10). With `memberInviteToken` the new account joins that
 * wedding in the same transaction; if joining fails, no account is created.
 */
export const POST = handler('/api/auth/signup', async (req) => {
  const { memberInviteToken, ...input } = await readJson(req, signupSchema);
  const join = memberInviteToken
    ? (
        session: Parameters<typeof acceptInvitationInTransaction>[0],
        user: Parameters<typeof acceptInvitationInTransaction>[2],
      ) => acceptInvitationInTransaction(session, memberInviteToken, user)
    : undefined;
  const { me, token, userId } = await signup(input, clientIp(req), join);
  const body = memberInviteToken ? { ...me, ...(await meWeddingFields(userId)) } : me;
  return Response.json(body, { status: 201, headers: { 'Set-Cookie': sessionCookie(token) } });
});
