import { withUser } from '@/modules/auth';
import { createWedding, getWedding, updateWedding, withMember } from '@/modules/weddings';
import { createWeddingSchema, updateWeddingSchema } from '@/modules/weddings/schemas';
import { handler, readJson } from '@/server/http/route';

/** POST /api/wedding (API_DESIGN §11): a signed-in user without a wedding creates one. */
export const POST = handler(
  '/api/wedding',
  withUser(async (req, ctx) => {
    const input = await readJson(req, createWeddingSchema);
    return Response.json(await createWedding(ctx.userId, input), { status: 201 });
  }),
);

/** GET /api/wedding (API_DESIGN §11): the caller's own wedding. */
export const GET = handler(
  '/api/wedding',
  withMember({}, async (_req, ctx) => Response.json(await getWedding(ctx))),
);

/** PATCH /api/wedding (API_DESIGN §11): any member edits the wedding details. */
export const PATCH = handler(
  '/api/wedding',
  withMember({}, async (req, ctx) => {
    const input = await readJson(req, updateWeddingSchema);
    return Response.json(await updateWedding(ctx, input));
  }),
);
