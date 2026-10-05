import { submitInvitationRsvp } from '@/modules/invitations';
import { guestRsvpSchema } from '@/modules/invitations/schemas';
import { consume } from '@/server/rate-limit/rate-limit';
import { handler, readJson } from '@/server/http/route';
import { publicHeaders } from '@/server/http/public';

const MINUTE = 60;

/** POST /api/public/invite/:token/rsvp (API_DESIGN §24): the guest's one answer for all events. */
export function POST(req: Request, { params }: RouteContext<'/api/public/invite/[token]/rsvp'>) {
  return handler('/api/public/invite/[token]/rsvp', async (request) => {
    const input = await readJson(request, guestRsvpSchema);
    const { token } = await params;
    await consume({ scope: 'rsvp-global', key: 'all', limit: 300, windowSeconds: MINUTE });
    await consume({ scope: 'rsvp', key: token, limit: 20, windowSeconds: 15 * MINUTE });
    return publicHeaders(Response.json(await submitInvitationRsvp(token, input)));
  })(req);
}
