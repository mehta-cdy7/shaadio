import 'server-only';
import type { EventDoc } from './event.model';
import type { EventResponse } from './schemas';

/**
 * Document → API `Event` (API_DESIGN §13). `headcount` is computed from guests (DATABASE_DESIGN
 * §13.2); guests arrive in slice 4, so it is 0 until then.
 */
export function toEventResponse(doc: EventDoc): EventResponse {
  const venue = doc.venue
    ? {
        ...(doc.venue.name ? { name: doc.venue.name } : {}),
        ...(doc.venue.address ? { address: doc.venue.address } : {}),
        ...(doc.venue.mapUrl ? { mapUrl: doc.venue.mapUrl } : {}),
      }
    : undefined;
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    type: doc.type,
    date: doc.date,
    ...(doc.startTime ? { startTime: doc.startTime } : {}),
    ...(doc.endTime ? { endTime: doc.endTime } : {}),
    ...(venue && Object.keys(venue).length ? { venue } : {}),
    ...(doc.description ? { description: doc.description } : {}),
    ...(doc.dressCode ? { dressCode: doc.dressCode } : {}),
    headcount: { households: 0, people: 0 },
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
