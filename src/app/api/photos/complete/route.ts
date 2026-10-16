import { completeUploads } from '@/modules/gallery';
import { uploadIdsSchema } from '@/modules/gallery/schemas';
import { withMember } from '@/modules/weddings';
import { handler, readJson } from '@/server/http/route';

/** POST /api/photos/complete (API_DESIGN §22.3): verify, copy and publish; per-photo results. */
export const POST = handler(
  '/api/photos/complete',
  withMember({}, async (req, ctx) => {
    const { uploadIds } = await readJson(req, uploadIdsSchema);
    return Response.json(await completeUploads(ctx, uploadIds));
  }),
);
