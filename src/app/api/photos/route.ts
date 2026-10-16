import { listPhotos } from '@/modules/gallery';
import { photoListQuerySchema } from '@/modules/gallery/schemas';
import { withMember } from '@/modules/weddings';
import { handler, parseWith } from '@/server/http/route';

/** GET /api/photos (API_DESIGN §21): newest first, by album, featured or uploader type. */
export const GET = handler(
  '/api/photos',
  withMember({}, async (req, ctx) => {
    const params = new URL(req.url).searchParams;
    const query = parseWith(
      photoListQuerySchema,
      Object.fromEntries([...params].filter(([, value]) => value !== '')),
    );
    return Response.json(await listPhotos(ctx, query));
  }),
);
