import { listPublicPhotos } from '@/modules/gallery';
import { publicPhotoListQuerySchema } from '@/modules/gallery/schemas';
import { clientIp, handler, parseWith } from '@/server/http/route';
import { publicHeaders } from '@/server/http/public';
import { consume } from '@/server/rate-limit/rate-limit';

/** GET /api/public/gallery/:token/photos (API_DESIGN §25): one page, by album. */
export function GET(req: Request, { params }: RouteContext<'/api/public/gallery/[token]/photos'>) {
  return handler('/api/public/gallery/[token]/photos', async (request) => {
    await consume({ scope: 'gallery-get', key: clientIp(request), limit: 300, windowSeconds: 60 });
    const { token } = await params;
    const search = new URL(request.url).searchParams;
    const query = parseWith(
      publicPhotoListQuerySchema,
      Object.fromEntries([...search].filter(([, value]) => value !== '')),
    );
    return publicHeaders(Response.json(await listPublicPhotos(token, query)));
  })(req);
}
