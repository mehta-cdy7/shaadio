import { completeCoverUpload } from '@/modules/gallery';
import { completeCoverSchema } from '@/modules/gallery/schemas';
import { withMember } from '@/modules/weddings';
import { handler, readJson } from '@/server/http/route';

/** POST /api/covers/complete (API_DESIGN §23): verify, store and set the cover. */
export const POST = handler(
  '/api/covers/complete',
  withMember({}, async (req, ctx) => {
    const { ticket } = await readJson(req, completeCoverSchema);
    return Response.json(await completeCoverUpload(ctx, ticket));
  }),
);
