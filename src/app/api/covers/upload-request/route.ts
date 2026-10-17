import { requestCoverUpload } from '@/modules/gallery';
import { coverUploadRequestSchema } from '@/modules/gallery/schemas';
import { withMember } from '@/modules/weddings';
import { handler, readJson } from '@/server/http/route';

/** POST /api/covers/upload-request (API_DESIGN §23): a signed ticket and one upload URL. */
export const POST = handler(
  '/api/covers/upload-request',
  withMember({}, async (req, ctx) => {
    const input = await readJson(req, coverUploadRequestSchema);
    return Response.json(await requestCoverUpload(ctx, input));
  }),
);
