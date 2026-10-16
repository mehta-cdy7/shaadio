import { completeGuestUploads } from '@/modules/gallery';
import { DEVICE_ID_HEADER, uploadIdsSchema } from '@/modules/gallery/schemas';
import { handler, readJson } from '@/server/http/route';
import { publicHeaders } from '@/server/http/public';

/** POST /api/public/gallery/:token/complete (API_DESIGN §22.3): this device's uploads only. */
export function POST(
  req: Request,
  { params }: RouteContext<'/api/public/gallery/[token]/complete'>,
) {
  return handler('/api/public/gallery/[token]/complete', async (request) => {
    const { uploadIds } = await readJson(request, uploadIdsSchema);
    const { token } = await params;
    const results = await completeGuestUploads(
      token,
      uploadIds,
      request.headers.get(DEVICE_ID_HEADER),
    );
    return publicHeaders(Response.json(results));
  })(req);
}
