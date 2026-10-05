import { getInvitation } from '@/modules/invitations';
import { consume } from '@/server/rate-limit/rate-limit';
import { clientIp, handler } from '@/server/http/route';
import { publicHeaders } from '@/server/http/public';

/**
 * GET /api/public/invite/:token (API_DESIGN §24): the invitation page refreshing when the guest
 * returns to the tab. No session; possession of the token is the access.
 */
export function GET(req: Request, { params }: RouteContext<'/api/public/invite/[token]'>) {
  return handler('/api/public/invite/[token]', async (request) => {
    await consume({ scope: 'invite-get', key: clientIp(request), limit: 120, windowSeconds: 60 });
    const { token } = await params;
    return publicHeaders(Response.json(await getInvitation(token)));
  })(req);
}
