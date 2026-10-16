import { requestGuestUploads } from '@/modules/gallery';
import { DEVICE_ID_HEADER, guestUploadRequestSchema } from '@/modules/gallery/schemas';
import { clientIp, handler, readJson } from '@/server/http/route';
import { publicHeaders } from '@/server/http/public';

/** POST /api/public/gallery/:token/upload-requests (API_DESIGN §22.1, guest column of §22.5). */
export function POST(
  req: Request,
  { params }: RouteContext<'/api/public/gallery/[token]/upload-requests'>,
) {
  return handler('/api/public/gallery/[token]/upload-requests', async (request) => {
    const input = await readJson(request, guestUploadRequestSchema);
    const { token } = await params;
    const tickets = await requestGuestUploads(token, input, {
      deviceId: request.headers.get(DEVICE_ID_HEADER),
      ip: clientIp(request),
    });
    return publicHeaders(Response.json(tickets));
  })(req);
}
