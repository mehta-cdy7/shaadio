import { markGuestSent } from '@/modules/guests';
import { markSentSchema } from '@/modules/guests/schemas';
import { withMember } from '@/modules/weddings';
import { handler, readJson } from '@/server/http/route';

/** POST /api/guests/:id/mark-sent (API_DESIGN §16): WhatsApp share or "Mark as sent". */
export function POST(req: Request, { params }: RouteContext<'/api/guests/[id]/mark-sent'>) {
  return handler(
    '/api/guests/[id]/mark-sent',
    withMember({}, async (request, ctx) => {
      const input = await readJson(request, markSentSchema);
      return Response.json(await markGuestSent(ctx, (await params).id, input));
    }),
  )(req);
}
