import { withUser } from '@/modules/auth';
import type { MeResponse } from '@/modules/auth/schemas';
import { acceptMemberInvitation } from '@/modules/members';
import { acceptInvitationSchema } from '@/modules/members/schemas';
import { meWeddingFields } from '@/modules/weddings';
import { handler, readJson } from '@/server/http/route';

/** POST /api/member-invitations/accept (API_DESIGN §12): a signed-in user joins the wedding. */
export const POST = handler(
  '/api/member-invitations/accept',
  withUser(async (req, ctx) => {
    const { token } = await readJson(req, acceptInvitationSchema);
    await acceptMemberInvitation({ userId: ctx.userId, ...ctx.user }, token);
    return Response.json({
      user: ctx.user,
      ...(await meWeddingFields(ctx.userId)),
    } satisfies MeResponse);
  }),
);
