import { deletePhoto, updatePhoto } from '@/modules/gallery';
import { updatePhotoSchema } from '@/modules/gallery/schemas';
import { withMember } from '@/modules/weddings';
import { assertSameOrigin, handler, readJson } from '@/server/http/route';

const ROUTE = '/api/photos/[id]';
type Context = RouteContext<'/api/photos/[id]'>;

/** PATCH /api/photos/:id (API_DESIGN §21): feature, unfeature, move album. */
export function PATCH(req: Request, { params }: Context) {
  return handler(
    ROUTE,
    withMember({}, async (request, ctx) => {
      const input = await readJson(request, updatePhotoSchema);
      return Response.json(await updatePhoto(ctx, (await params).id, input));
    }),
  )(req);
}

/** DELETE /api/photos/:id (API_DESIGN §21, DATABASE_DESIGN §14.5): any member. */
export function DELETE(req: Request, { params }: Context) {
  return handler(
    ROUTE,
    withMember({}, async (request, ctx) => {
      assertSameOrigin(request);
      await deletePhoto(ctx, (await params).id);
      return new Response(null, { status: 204 });
    }),
  )(req);
}
