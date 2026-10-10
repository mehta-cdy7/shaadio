import { revokeMemberInvitation } from '@/modules/members';
import { emptySchema } from '@/modules/auth/schemas';
import { withMember } from '@/modules/weddings';
import { handler, readJson } from '@/server/http/route';

/** POST /api/member-invitations/:id/revoke (API_DESIGN §12): the link stops working at once. */
export function POST(
  req: Request,
  { params }: RouteContext<'/api/member-invitations/[id]/revoke'>,
) {
  return handler(
    '/api/member-invitations/[id]/revoke',
    withMember({ role: 'ADMIN' }, async (request, ctx) => {
      await readJson(request, emptySchema);
      return Response.json(await revokeMemberInvitation(ctx, (await params).id));
    }),
  )(req);
}
