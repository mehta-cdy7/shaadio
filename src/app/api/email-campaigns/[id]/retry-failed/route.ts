import { emptySchema } from '@/modules/auth/schemas';
import { retryFailedCampaign } from '@/modules/invitations';
import { withMember } from '@/modules/weddings';
import { handler, readJson } from '@/server/http/route';

/** POST /api/email-campaigns/:id/retry-failed (API_DESIGN §16): failed jobs are queued again. */
export function POST(
  req: Request,
  { params }: RouteContext<'/api/email-campaigns/[id]/retry-failed'>,
) {
  return handler(
    '/api/email-campaigns/[id]/retry-failed',
    withMember({}, async (request, ctx) => {
      await readJson(request, emptySchema);
      return Response.json(await retryFailedCampaign(ctx, (await params).id), { status: 202 });
    }),
  )(req);
}
