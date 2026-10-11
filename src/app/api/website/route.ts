import { getWebsite, updateWebsite, withMember } from '@/modules/weddings';
import { updateWebsiteSchema } from '@/modules/weddings/schemas';
import { handler, readJson } from '@/server/http/route';

/** GET /api/website (API_DESIGN §20): any member. */
export const GET = handler(
  '/api/website',
  withMember({}, async (_req, ctx) => Response.json(await getWebsite(ctx))),
);

/** PATCH /api/website (API_DESIGN §20): theme and welcome message. */
export const PATCH = handler(
  '/api/website',
  withMember({}, async (req, ctx) => {
    const input = await readJson(req, updateWebsiteSchema);
    return Response.json(await updateWebsite(ctx, input));
  }),
);
