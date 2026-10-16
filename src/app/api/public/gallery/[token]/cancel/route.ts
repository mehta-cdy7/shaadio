import { cancelGuestUploads } from '@/modules/gallery';
import { DEVICE_ID_HEADER, uploadIdsSchema } from '@/modules/gallery/schemas';
import { handler, readJson } from '@/server/http/route';
import { publicHeaders } from '@/server/http/public';

/** POST /api/public/gallery/:token/cancel (API_DESIGN §22.4): releases this device's uploads. */
export function POST(req: Request, { params }: RouteContext<'/api/public/gallery/[token]/cancel'>) {
  return handler('/api/public/gallery/[token]/cancel', async (request) => {
    const { uploadIds } = await readJson(request, uploadIdsSchema);
    const { token } = await params;
    await cancelGuestUploads(token, uploadIds, request.headers.get(DEVICE_ID_HEADER));
    return publicHeaders(new Response(null, { status: 204 }));
  })(req);
}
