import { deleteGuest, getGuest, updateGuest } from '@/modules/guests';
import { cancelGuestEmailJobs } from '@/modules/invitations';
import { updateGuestSchema } from '@/modules/guests/schemas';
import { withMember } from '@/modules/weddings';
import { assertSameOrigin, handler, readJson } from '@/server/http/route';

const ROUTE = '/api/guests/[id]';
type Context = RouteContext<'/api/guests/[id]'>;

/** GET /api/guests/:id (API_DESIGN §14): the guest with their invitation link. */
export function GET(req: Request, { params }: Context) {
  return handler(
    ROUTE,
    withMember({}, async (_req, ctx) => Response.json(await getGuest(ctx, (await params).id))),
  )(req);
}

/** PATCH /api/guests/:id (API_DESIGN §14). */
export function PATCH(req: Request, { params }: Context) {
  return handler(
    ROUTE,
    withMember({}, async (request, ctx) => {
      const input = await readJson(request, updateGuestSchema);
      return Response.json(await updateGuest(ctx, (await params).id, input));
    }),
  )(req);
}

/** DELETE /api/guests/:id (API_DESIGN §14, DATABASE_DESIGN §14.2). */
export function DELETE(req: Request, { params }: Context) {
  return handler(
    ROUTE,
    withMember({}, async (request, ctx) => {
      // A DELETE has no body, but it is still a mutation: it must come from the app (API §2.2).
      assertSameOrigin(request);
      // The guest's queued emails are cancelled in the same transaction (DATABASE_DESIGN §14.2).
      await deleteGuest(ctx, (await params).id, (session, guestId) =>
        cancelGuestEmailJobs(session, ctx, guestId),
      );
      return new Response(null, { status: 204 });
    }),
  )(req);
}
