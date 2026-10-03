import 'server-only';
import { todayIn } from '@/lib/dates';
import type { WeddingResponse } from './schemas';
import type { WeddingDoc } from './wedding.model';

/**
 * Document → API `Wedding` (API_DESIGN §11). Fields are picked one by one, so storage-only fields
 * (gallery token, counters, status) can never leak into a response.
 */
export function toWeddingResponse(doc: WeddingDoc, isEmpty: boolean): WeddingResponse {
  const { location } = doc;
  return {
    id: doc._id.toHexString(),
    brideName: doc.brideName,
    groomName: doc.groomName,
    nameOrder: doc.nameOrder,
    ...(doc.title ? { title: doc.title } : {}),
    ...(doc.description ? { description: doc.description } : {}),
    weddingDate: doc.weddingDate,
    timezone: doc.timezone,
    location: {
      formattedAddress: location.formattedAddress,
      city: location.city,
      ...(location.state ? { state: location.state } : {}),
      ...(location.country ? { country: location.country } : {}),
      ...(location.lat !== undefined && location.lat !== null ? { lat: location.lat } : {}),
      ...(location.lng !== undefined && location.lng !== null ? { lng: location.lng } : {}),
      ...(location.googlePlaceId ? { googlePlaceId: location.googlePlaceId } : {}),
    },
    ...(doc.rsvpDeadline ? { rsvpDeadline: doc.rsvpDeadline } : {}),
    rsvpLocked: Boolean(doc.rsvpDeadline && todayIn(doc.timezone) > doc.rsvpDeadline),
    isEmpty,
    createdAt: doc.createdAt.toISOString(),
  };
}
