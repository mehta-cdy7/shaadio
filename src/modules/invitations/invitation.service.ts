import 'server-only';
import type { z } from 'zod';
import { todayIn } from '@/lib/dates';
import { invitationEvents } from '@/modules/events';
import { findInvitationGuest, markInvitationOpened, submitLinkRsvp } from '@/modules/guests';
import { findInvitationWedding, type InvitationWedding } from '@/modules/weddings';
import { findGuestByInviteToken } from '@/server/db/unscoped';
import { AppError } from '@/server/http/errors';
import type { guestRsvpSchema, GuestRsvpResponse, InvitationResponse } from './schemas';

/** Bad, regenerated and deleted-guest tokens all get this identical 404 (API_DESIGN §30). */
function unavailable(): AppError {
  return new AppError('NOT_FOUND', 'This link is not available.');
}

function isLocked(wedding: InvitationWedding): boolean {
  return Boolean(wedding.rsvpDeadline && todayIn(wedding.timezone) > wedding.rsvpDeadline);
}

/**
 * Token → guest and ACTIVE wedding (DATABASE_DESIGN §6.3 #3). Everything after the lookup is
 * scoped by the guest's own `weddingId`.
 */
async function resolve(token: string) {
  const ref = await findGuestByInviteToken(token);
  if (!ref) throw unavailable();
  const scope = { weddingId: ref.weddingId };
  const [wedding, guest] = await Promise.all([
    findInvitationWedding(ref.weddingId),
    findInvitationGuest(scope, ref.guestId, token),
  ]);
  if (!wedding || !guest) throw unavailable();
  return { scope, guestId: ref.guestId, wedding, guest };
}

/**
 * The invitation for `GET /api/public/invite/:token` and the server-rendered page. Reading never
 * marks the link opened: link-preview bots read too (API_DESIGN §24).
 */
export async function getInvitation(token: string): Promise<InvitationResponse> {
  const { scope, wedding, guest } = await resolve(token);
  const events = await invitationEvents(scope, guest.invitedEventIds);
  return {
    wedding: {
      brideName: wedding.brideName,
      groomName: wedding.groomName,
      nameOrder: wedding.nameOrder,
      weddingDate: wedding.weddingDate,
      theme: wedding.website.theme,
      ...(wedding.website.welcomeMessage ? { welcomeMessage: wedding.website.welcomeMessage } : {}),
    },
    guest: { name: guest.name, maxPeople: guest.maxPeople },
    events,
    rsvp: guest.rsvp,
    ...(wedding.rsvpDeadline ? { rsvpDeadline: wedding.rsvpDeadline } : {}),
    rsvpLocked: isLocked(wedding),
  };
}

/**
 * `POST /api/public/invite/:token/opened`: the page's script, so a real browser, opened the link.
 * Only the first call writes (DATABASE_DESIGN §5.8).
 */
export async function markInvitationLinkOpened(token: string): Promise<void> {
  const { scope, guestId } = await resolve(token);
  await markInvitationOpened(scope, guestId, token);
}

/**
 * `POST /api/public/invite/:token/rsvp` (API_DESIGN §24): one answer for all invited events
 * (PRD §9.11). The deadline binds guests only; members can still edit.
 */
export async function submitInvitationRsvp(
  token: string,
  input: z.output<typeof guestRsvpSchema>,
): Promise<GuestRsvpResponse> {
  const { scope, guestId, wedding, guest } = await resolve(token);
  if (isLocked(wedding)) {
    throw new AppError('RSVP_LOCKED', 'The RSVP deadline has passed.', {
      rsvpDeadline: wedding.rsvpDeadline,
    });
  }
  if (!guest.invitedEventIds.length) {
    throw new AppError('NO_EVENTS', 'This invitation has no events right now.');
  }
  const rsvp = await submitLinkRsvp(scope, guestId, token, input);
  return { rsvp, rsvpLocked: false };
}
