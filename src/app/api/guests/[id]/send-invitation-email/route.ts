import { emptySchema } from '@/modules/auth/schemas';
import { sendGuestInvitationEmail } from '@/modules/invitations';
import { withMember } from '@/modules/weddings';
import { handler, readJson } from '@/server/http/route';

/** POST /api/guests/:id/send-invitation-email (API_DESIGN §16): sent now, not queued. */
export function POST(
  req: Request,
  { params }: RouteContext<'/api/guests/[id]/send-invitation-email'>,
) {
  return handler(
    '/api/guests/[id]/send-invitation-email',
    withMember({}, async (request, ctx) => {
      await readJson(request, emptySchema);
      return Response.json(await sendGuestInvitationEmail(ctx, (await params).id));
    }),
  )(req);
}
