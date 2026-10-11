import { emptySchema } from '@/modules/auth/schemas';
import { setWebsitePublished, withMember } from '@/modules/weddings';
import { handler, readJson } from '@/server/http/route';

/** POST /api/website/unpublish (API_DESIGN §20): any member; a repeat changes nothing. */
export const POST = handler(
  '/api/website/unpublish',
  withMember({}, async (req, ctx) => {
    await readJson(req, emptySchema);
    return Response.json(await setWebsitePublished(ctx, false));
  }),
);
