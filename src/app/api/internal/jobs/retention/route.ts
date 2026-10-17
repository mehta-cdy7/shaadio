import { runPhotoRetention } from '@/modules/gallery';
import { assertCron } from '@/server/http/cron';
import { handler } from '@/server/http/route';

export const maxDuration = 60;

/** Stop with time to spare, leaving the rest for the next run (API_DESIGN §27). */
const BUDGET_MS = 45_000;

/**
 * GET /api/internal/jobs/retention (API_DESIGN §27): deletes photos of weddings more than 12 months
 * past their date (DATABASE_DESIGN §14.7). Cron only (§2.3). Idempotent.
 */
export const GET = handler('/api/internal/jobs/retention', async (req) => {
  assertCron(req);
  return Response.json(await runPhotoRetention(Date.now() + BUDGET_MS));
});
