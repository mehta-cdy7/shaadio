import { getPublicGallery } from '@/modules/gallery';
import { clientIp, handler } from '@/server/http/route';
import { publicHeaders } from '@/server/http/public';
import { consume } from '@/server/rate-limit/rate-limit';

/** GET /api/public/gallery/:token (API_DESIGN §25): couple, albums and the guest switches. */
export function GET(req: Request, { params }: RouteContext<'/api/public/gallery/[token]'>) {
  return handler('/api/public/gallery/[token]', async (request) => {
    await consume({ scope: 'gallery-get', key: clientIp(request), limit: 300, windowSeconds: 60 });
    const { token } = await params;
    return publicHeaders(Response.json(await getPublicGallery(token)));
  })(req);
}
