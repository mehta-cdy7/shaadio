import { markInvitationLinkOpened } from '@/modules/invitations';
import { openedSchema } from '@/modules/invitations/schemas';
import { publicHeaders } from '@/server/http/public';
import { clientIp, handler, readJson } from '@/server/http/route';
import { consume } from '@/server/rate-limit/rate-limit';

/**
 * POST /api/public/invite/:token/opened (API_DESIGN §24): sent by the invitation page's script, so
 * only a real browser marks the link opened. Shares the public invitation GET limit (§7).
 */
export function POST(req: Request, { params }: RouteContext<'/api/public/invite/[token]/opened'>) {
  return handler('/api/public/invite/[token]/opened', async (request) => {
    await readJson(request, openedSchema);
    await consume({ scope: 'invite-get', key: clientIp(request), limit: 120, windowSeconds: 60 });
    await markInvitationLinkOpened((await params).token);
    return publicHeaders(new Response(null, { status: 204 }));
  })(req);
}
