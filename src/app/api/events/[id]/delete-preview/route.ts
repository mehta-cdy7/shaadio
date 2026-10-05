import { eventDeletePreview } from '@/modules/events';
import { withMember } from '@/modules/weddings';
import { handler } from '@/server/http/route';

/** GET /api/events/:id/delete-preview (API_DESIGN §13): feeds the delete confirmation. */
export function GET(req: Request, { params }: RouteContext<'/api/events/[id]/delete-preview'>) {
  return handler(
    '/api/events/[id]/delete-preview',
    withMember({}, async (_req, ctx) =>
      Response.json(await eventDeletePreview(ctx, (await params).id)),
    ),
  )(req);
}
