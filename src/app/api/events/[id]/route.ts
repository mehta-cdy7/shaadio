import { deleteEvent, getEvent, updateEvent } from '@/modules/events';
import { updateEventSchema } from '@/modules/events/schemas';
import { withMember } from '@/modules/weddings';
import { assertSameOrigin, handler, readJson } from '@/server/http/route';

const ROUTE = '/api/events/[id]';
type Context = RouteContext<'/api/events/[id]'>;

/** GET /api/events/:id (API_DESIGN §13). Another wedding's id is 404 (§3.3). */
export function GET(req: Request, { params }: Context) {
  return handler(
    ROUTE,
    withMember({}, async (_req, ctx) => Response.json(await getEvent(ctx, (await params).id))),
  )(req);
}

/** PATCH /api/events/:id (API_DESIGN §13). */
export function PATCH(req: Request, { params }: Context) {
  return handler(
    ROUTE,
    withMember({}, async (request, ctx) => {
      const input = await readJson(request, updateEventSchema);
      return Response.json(await updateEvent(ctx, (await params).id, input));
    }),
  )(req);
}

/** DELETE /api/events/:id (API_DESIGN §13, DATABASE_DESIGN §14.1). */
export function DELETE(req: Request, { params }: Context) {
  return handler(
    ROUTE,
    withMember({}, async (request, ctx) => {
      // A DELETE has no body, but it is still a mutation: it must come from the app (API §2.2).
      assertSameOrigin(request);
      await deleteEvent(ctx, (await params).id);
      return new Response(null, { status: 204 });
    }),
  )(req);
}
