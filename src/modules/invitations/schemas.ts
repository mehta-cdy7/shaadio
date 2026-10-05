import { z } from 'zod';
import type { EventType } from '@/modules/events/schemas';
import { MAX_PEOPLE_MAX, type RsvpStatus } from '@/modules/guests/schemas';

/** Shapes for the public invitation endpoints (API_DESIGN §24). Client-safe. */

/** `POST /api/public/invite/:token/opened`: an empty JSON body. */
export const openedSchema = z.strictObject({});

/** `POST /api/public/invite/:token/rsvp`. A guest cannot choose PENDING. */
export const guestRsvpSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('ATTENDING'),
    attendingCount: z
      .number()
      .int()
      .min(1, 'At least 1 person.')
      .max(MAX_PEOPLE_MAX, `At most ${MAX_PEOPLE_MAX}.`),
  }),
  z.strictObject({ status: z.literal('NOT_ATTENDING') }),
]);
export type GuestRsvpInput = z.input<typeof guestRsvpSchema>;

export type InvitationRsvp = { status: RsvpStatus; attendingCount: number };

/** `GET /api/public/invite/:token`: a minimal projection with no ids, contacts or counts. */
export type InvitationResponse = {
  wedding: {
    brideName: string;
    groomName: string;
    nameOrder: 'BRIDE_FIRST' | 'GROOM_FIRST';
    weddingDate: string;
    theme: 'CLASSIC' | 'MINIMAL' | 'MODERN';
    welcomeMessage?: string;
  };
  guest: { name: string; maxPeople: number };
  events: {
    name: string;
    type: EventType;
    date: string;
    startTime?: string;
    endTime?: string;
    venue?: { name?: string; address?: string; mapUrl?: string };
    dressCode?: string;
  }[];
  rsvp: InvitationRsvp;
  rsvpDeadline?: string;
  rsvpLocked: boolean;
};

export type GuestRsvpResponse = { rsvp: InvitationRsvp; rsvpLocked: boolean };
