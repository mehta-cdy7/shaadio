import { pingDb } from '@/server/db/connection';
import { newRequestId } from '@/server/http/request-id';

/**
 * GET /api/health — liveness + database check for uptime monitors. No auth, and deliberately no
 * version, environment or host details in the body.
 */
export async function GET(): Promise<Response> {
  const dbUp = await pingDb();

  return Response.json(dbUp ? { status: 'ok', db: 'up' } : { status: 'degraded', db: 'down' }, {
    status: dbUp ? 200 : 503,
    headers: { 'Cache-Control': 'no-store', 'X-Request-Id': newRequestId() },
  });
}
