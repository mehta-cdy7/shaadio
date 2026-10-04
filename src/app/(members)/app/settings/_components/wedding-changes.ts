import type { UpdateWeddingInput, weddingFieldsSchema } from '@/modules/weddings/schemas';
import type { WeddingFormValues } from '../../../_components/wedding-form';

type Parsed = ReturnType<typeof weddingFieldsSchema.parse>;

/**
 * The `PATCH /api/wedding` body for a settings save: only what the user changed (API_DESIGN §11,
 * omitted = unchanged). The location goes only when venue, city or state changed, because the
 * server replaces the whole place, and would drop coordinates and a place id kept from Places.
 * Cleared optional text is sent as `null`.
 */
export function weddingChanges(
  saved: WeddingFormValues,
  values: WeddingFormValues,
  parsed: Parsed,
): UpdateWeddingInput {
  const changed = (key: keyof WeddingFormValues) => saved[key].trim() !== values[key].trim();
  const body: UpdateWeddingInput = {};

  if (changed('brideName')) body.brideName = parsed.brideName;
  if (changed('groomName')) body.groomName = parsed.groomName;
  if (saved.nameOrder !== values.nameOrder) body.nameOrder = parsed.nameOrder;
  if (changed('weddingDate')) body.weddingDate = parsed.weddingDate;
  if (changed('venue') || changed('city') || changed('state')) body.location = parsed.location;
  if (changed('title')) body.title = parsed.title ?? null;
  if (changed('description')) body.description = parsed.description ?? null;
  return body;
}
