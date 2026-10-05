import { createGuest, listGuests } from '@/modules/guests';
import {
  createGuestSchema,
  guestListQueryInput,
  guestListQuerySchema,
} from '@/modules/guests/schemas';
import { withMember } from '@/modules/weddings';
import { handler, parseWith, readJson } from '@/server/http/route';

/** GET /api/guests (API_DESIGN §14): one page by name, with the list filters. */
export const GET = handler(
  '/api/guests',
  withMember({}, async (req, ctx) => {
    const query = parseWith(
      guestListQuerySchema,
      guestListQueryInput(new URL(req.url).searchParams),
    );
    return Response.json(await listGuests(ctx, query));
  }),
);

/** POST /api/guests (API_DESIGN §14): creates the guest and their invitation link. */
export const POST = handler(
  '/api/guests',
  withMember({}, async (req, ctx) => {
    const input = await readJson(req, createGuestSchema);
    return Response.json(await createGuest(ctx, input), { status: 201 });
  }),
);
