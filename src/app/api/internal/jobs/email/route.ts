import { processEmailQueue } from '@/modules/invitations';
import { assertCron } from '@/server/http/cron';
import { handler } from '@/server/http/route';

/** Long enough for one provider batch; the run stops well before it (API_DESIGN §27). */
export const maxDuration = 60;

/**
 * GET /api/internal/jobs/email (API_DESIGN §27): Vercel Cron drains the email queue within today's
 * allowance. Only `Authorization: Bearer <CRON_SECRET>` gets through (§2.3). Idempotent.
 */
export const GET = handler('/api/internal/jobs/email', async (req) => {
  assertCron(req);
  return Response.json(await processEmailQueue());
});
