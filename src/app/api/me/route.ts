import { withUser } from '@/modules/auth';
import type { MeResponse } from '@/modules/auth/schemas';
import { handler } from '@/server/http/route';

/**
 * GET /api/me (API_DESIGN §10). Membership and wedding are omitted until weddings exist
 * (slice 1b); the client then routes to "create or join a wedding".
 */
export const GET = handler(
  '/api/me',
  withUser(async (_req, ctx) => Response.json({ user: ctx.user } satisfies MeResponse)),
);
