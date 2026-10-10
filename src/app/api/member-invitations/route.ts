import { inviteMember, listMemberInvitations } from '@/modules/members';
import { inviteMemberSchema } from '@/modules/members/schemas';
import { withMember } from '@/modules/weddings';
import { handler, readJson } from '@/server/http/route';

/** GET /api/member-invitations (API_DESIGN §12): Admin; pending and expired. */
export const GET = handler(
  '/api/member-invitations',
  withMember({ role: 'ADMIN' }, async (_req, ctx) =>
    Response.json(await listMemberInvitations(ctx)),
  ),
);

/** POST /api/member-invitations (API_DESIGN §12): emails the invitation and returns its link once. */
export const POST = handler(
  '/api/member-invitations',
  withMember({ role: 'ADMIN' }, async (req, ctx) => {
    const input = await readJson(req, inviteMemberSchema);
    return Response.json(await inviteMember(ctx, input), { status: 201 });
  }),
);
