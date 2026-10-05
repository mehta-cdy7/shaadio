import { createEvent, listEvents } from '@/modules/events';
import { createEventSchema } from '@/modules/events/schemas';
import { withMember } from '@/modules/weddings';
import { handler, readJson } from '@/server/http/route';

/** GET /api/events (API_DESIGN §13): all events, by date then start time. */
export const GET = handler(
  '/api/events',
  withMember({}, async (_req, ctx) => Response.json({ items: await listEvents(ctx) })),
);

/** POST /api/events (API_DESIGN §13). */
export const POST = handler(
  '/api/events',
  withMember({}, async (req, ctx) => {
    const input = await readJson(req, createEventSchema);
    return Response.json(await createEvent(ctx, input), { status: 201 });
  }),
);
