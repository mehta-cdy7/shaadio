import { resendMemberInvitation } from '@/modules/members';
import { emptySchema } from '@/modules/auth/schemas';
import { withMember } from '@/modules/weddings';
import { handler, readJson } from '@/server/http/route';

/** POST /api/member-invitations/:id/resend (API_DESIGN §12): new link and a fresh 7 days; the old link stops working. */
export function POST(
  req: Request,
  { params }: RouteContext<'/api/member-invitations/[id]/resend'>,
) {
  return handler(
    '/api/member-invitations/[id]/resend',
    withMember({ role: 'ADMIN' }, async (request, ctx) => {
      await readJson(request, emptySchema);
      return Response.json(await resendMemberInvitation(ctx, (await params).id));
    }),
  )(req);
}
