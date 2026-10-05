import { regenerateGuestLink } from '@/modules/guests';
import { withMember } from '@/modules/weddings';
import { assertSameOrigin, handler } from '@/server/http/route';

/** POST /api/guests/:id/regenerate-link (API_DESIGN §14): the old link stops working at once. */
export function POST(req: Request, { params }: RouteContext<'/api/guests/[id]/regenerate-link'>) {
  return handler(
    '/api/guests/[id]/regenerate-link',
    withMember({}, async (request, ctx) => {
      // No body, but still a mutation (API §2.2).
      assertSameOrigin(request);
      return Response.json(await regenerateGuestLink(ctx, (await params).id));
    }),
  )(req);
}
