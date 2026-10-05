import { updateGuestRsvp } from '@/modules/guests';
import { memberRsvpSchema } from '@/modules/guests/schemas';
import { withMember } from '@/modules/weddings';
import { handler, readJson } from '@/server/http/route';

/** PATCH /api/guests/:id/rsvp (API_DESIGN §14, §6.1): a member records a guest's answer. */
export function PATCH(req: Request, { params }: RouteContext<'/api/guests/[id]/rsvp'>) {
  return handler(
    '/api/guests/[id]/rsvp',
    withMember({}, async (request, ctx) => {
      const input = await readJson(request, memberRsvpSchema);
      return Response.json(await updateGuestRsvp(ctx, (await params).id, input));
    }),
  )(req);
}
