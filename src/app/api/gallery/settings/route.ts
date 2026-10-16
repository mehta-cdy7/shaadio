import { updateGallerySettingsSchema } from '@/modules/gallery/schemas';
import { getGallerySettings, updateGallerySettings, withMember } from '@/modules/weddings';
import { handler, readJson } from '@/server/http/route';

/** GET /api/gallery/settings (API_DESIGN §21): link, guest switches and storage used. */
export const GET = handler(
  '/api/gallery/settings',
  withMember({}, async (_req, ctx) => Response.json(await getGallerySettings(ctx))),
);

/** PATCH /api/gallery/settings (API_DESIGN §21): guest viewing and uploads on or off. */
export const PATCH = handler(
  '/api/gallery/settings',
  withMember({}, async (req, ctx) => {
    const input = await readJson(req, updateGallerySettingsSchema);
    return Response.json(await updateGallerySettings(ctx, input));
  }),
);
