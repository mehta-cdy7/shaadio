import { createCampaign, listCampaigns } from '@/modules/invitations';
import { createCampaignSchema } from '@/modules/invitations/schemas';
import { withMember } from '@/modules/weddings';
import { handler, readJson } from '@/server/http/route';

/** GET /api/email-campaigns (API_DESIGN §16): the 20 most recent. */
export const GET = handler(
  '/api/email-campaigns',
  withMember({}, async (_req, ctx) => Response.json(await listCampaigns(ctx))),
);

/** POST /api/email-campaigns (API_DESIGN §16): queues invitation emails; 202, never "sent". */
export const POST = handler(
  '/api/email-campaigns',
  withMember({}, async (req, ctx) => {
    const input = await readJson(req, createCampaignSchema);
    return Response.json(await createCampaign(ctx, input), { status: 202 });
  }),
);
