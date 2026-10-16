import { requestUploads } from '@/modules/gallery';
import { uploadRequestSchema } from '@/modules/gallery/schemas';
import { withMember } from '@/modules/weddings';
import { handler, readJson } from '@/server/http/route';

/**
 * POST /api/photos/upload-requests (API_DESIGN §22.1, member column of §22.5): reserves slots and
 * returns signed upload URLs. Members have no device or IP limits; the name is their own.
 */
export const POST = handler(
  '/api/photos/upload-requests',
  withMember({}, async (req, ctx) => {
    const input = await readJson(req, uploadRequestSchema);
    return Response.json(
      await requestUploads(
        {
          weddingId: ctx.weddingId,
          uploaderType: 'MEMBER',
          uploaderUserId: ctx.userId,
          uploaderName: ctx.user.name,
        },
        input,
      ),
    );
  }),
);
