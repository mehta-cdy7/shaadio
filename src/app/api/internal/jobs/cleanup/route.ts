import { cleanupExpiredUploads } from '@/modules/gallery';
import { assertCron } from '@/server/http/cron';
import { handler } from '@/server/http/route';

export const maxDuration = 60;

/** Stop with time to spare, leaving the rest for the next run (API_DESIGN §27). */
const BUDGET_MS = 45_000;

/**
 * GET /api/internal/jobs/cleanup (API_DESIGN §27): releases expired upload reservations and deletes
 * their staging files (DATABASE_DESIGN §14.6). Cron only (§2.3). Idempotent.
 */
export const GET = handler('/api/internal/jobs/cleanup', async (req) => {
  assertCron(req);
  return Response.json(await cleanupExpiredUploads(Date.now() + BUDGET_MS));
});
