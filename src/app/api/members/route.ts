import { listMembers } from '@/modules/members';
import { withMember } from '@/modules/weddings';
import { handler } from '@/server/http/route';

/** GET /api/members (API_DESIGN §12): any member sees who else is helping. */
export const GET = handler(
  '/api/members',
  withMember({}, async (_req, ctx) => Response.json(await listMembers(ctx))),
);
