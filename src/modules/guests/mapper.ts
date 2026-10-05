import 'server-only';
import { env } from '@/server/env';
import type { GuestDoc } from './guest.model';
import type { GuestDetailResponse, GuestResponse } from './schemas';

/**
 * Document → API `Guest` (API_DESIGN §14). Storage is flattened: `invitedEvents: [{ eventId }]`
 * becomes `invitedEventIds` (API-09), and `inviteLink.firstOpenedAt` becomes `linkOpenedAt`.
 * The token never appears here; only `toGuestDetail` adds the link.
 */
export function toGuestResponse(doc: GuestDoc): GuestResponse {
  const { rsvp } = doc;
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    ...(doc.side ? { side: doc.side } : {}),
    ...(doc.email ? { email: doc.email } : {}),
    ...(doc.phone ? { phone: doc.phone } : {}),
    maxPeople: doc.maxPeople,
    invitedEventIds: doc.invitedEvents.map((item) => item.eventId.toHexString()),
    rsvp: {
      status: rsvp.status,
      attendingCount: rsvp.attendingCount,
      ...(rsvp.respondedAt ? { respondedAt: rsvp.respondedAt.toISOString() } : {}),
      ...(rsvp.respondedVia ? { respondedVia: rsvp.respondedVia } : {}),
    },
    ...(doc.delivery
      ? { delivery: { sentAt: doc.delivery.sentAt.toISOString(), sentVia: doc.delivery.sentVia } }
      : {}),
    ...(doc.inviteLink?.firstOpenedAt
      ? { linkOpenedAt: doc.inviteLink.firstOpenedAt.toISOString() }
      : {}),
    ...(doc.notes ? { notes: doc.notes } : {}),
    version: doc.version,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** The guest's invitation page (PRD §9.9). */
export function inviteUrl(token: string): string {
  return `${env().APP_ORIGIN}/invite/${token}`;
}

/** `GuestDetail`: needs a document read with `+inviteLink.token`. */
export function toGuestDetail(doc: GuestDoc): GuestDetailResponse {
  const token = doc.inviteLink?.token;
  if (!token) throw new Error('toGuestDetail needs the invitation token selected');
  return { ...toGuestResponse(doc), inviteUrl: inviteUrl(token) };
}
