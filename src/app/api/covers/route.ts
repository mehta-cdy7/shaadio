import { deleteCover } from '@/modules/gallery';
import { deleteCoverQuerySchema } from '@/modules/gallery/schemas';
import { withMember } from '@/modules/weddings';
import { assertSameOrigin, handler, parseWith } from '@/server/http/route';

/** DELETE /api/covers?target=…&eventId=… (API_DESIGN §23): removes the cover and its object. */
export const DELETE = handler(
  '/api/covers',
  withMember({}, async (req, ctx) => {
    assertSameOrigin(req);
    const params = new URL(req.url).searchParams;
    const { target, eventId } = parseWith(
      deleteCoverQuerySchema,
      Object.fromEntries([...params].filter(([, value]) => value !== '')),
    );
    await deleteCover(ctx, target, eventId);
    return new Response(null, { status: 204 });
  }),
);
