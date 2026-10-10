import { removeMember, updateMember } from '@/modules/members';
import { updateMemberSchema } from '@/modules/members/schemas';
import { withMember } from '@/modules/weddings';
import { assertSameOrigin, handler, readJson } from '@/server/http/route';

const ROUTE = '/api/members/[userId]';
type Context = RouteContext<'/api/members/[userId]'>;

/** PATCH /api/members/:userId (API_DESIGN §12): Admin changes a role or label. */
export function PATCH(req: Request, { params }: Context) {
  return handler(
    ROUTE,
    withMember({ role: 'ADMIN' }, async (request, ctx) => {
      const input = await readJson(request, updateMemberSchema);
      return Response.json(await updateMember(ctx, (await params).userId, input));
    }),
  )(req);
}

/** DELETE /api/members/:userId (API_DESIGN §12): Admin removes a member. */
export function DELETE(req: Request, { params }: Context) {
  return handler(
    ROUTE,
    withMember({ role: 'ADMIN' }, async (request, ctx) => {
      assertSameOrigin(request);
      await removeMember(ctx, (await params).userId);
      return new Response(null, { status: 204 });
    }),
  )(req);
}
