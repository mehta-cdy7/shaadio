import { withUser } from '@/modules/auth';
import type { MeResponse } from '@/modules/auth/schemas';
import { meWeddingFields } from '@/modules/weddings';
import { handler } from '@/server/http/route';

/**
 * GET /api/me (API_DESIGN §10): the user, plus their membership and wedding when they have one,
 * so the client can choose between the dashboard and "create or join a wedding".
 */
export const GET = handler(
  '/api/me',
  withUser(async (_req, ctx) =>
    Response.json({ user: ctx.user, ...(await meWeddingFields(ctx.userId)) } satisfies MeResponse),
  ),
);
