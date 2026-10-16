import { cancelUploads } from '@/modules/gallery';
import { uploadIdsSchema } from '@/modules/gallery/schemas';
import { withMember } from '@/modules/weddings';
import { handler, readJson } from '@/server/http/route';

/** POST /api/photos/cancel (API_DESIGN §22.4): releases slots for abandoned uploads. */
export const POST = handler(
  '/api/photos/cancel',
  withMember({}, async (req, ctx) => {
    const { uploadIds } = await readJson(req, uploadIdsSchema);
    await cancelUploads(ctx, uploadIds);
    return new Response(null, { status: 204 });
  }),
);
