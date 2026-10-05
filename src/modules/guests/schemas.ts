import { z } from 'zod';
import { normalizePhone } from '@/lib/phone';

/** Request and response shapes for guests (API_DESIGN §14). Client-safe: shared with the forms. */

export const SIDES = ['BRIDE', 'GROOM', 'BOTH'] as const;
export type Side = (typeof SIDES)[number];

export const RSVP_STATUSES = ['PENDING', 'ATTENDING', 'NOT_ATTENDING'] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

/** Limits from DATABASE_DESIGN §1.12, §5.8 and §15. */
export const GUEST_NAME_MAX = 120;
export const EMAIL_MAX = 254;
export const NOTES_MAX = 2000;
export const MAX_PEOPLE_MIN = 1;
export const MAX_PEOPLE_MAX = 20;
export const GUESTS_PER_WEDDING = 1000;
export const INVITED_EVENTS_MAX = 30;
export const SEARCH_MAX = 100;
export const PAGE_SIZE_DEFAULT = 50;
export const PAGE_SIZE_MAX = 100;

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'Not a valid id.');

const name = z.string().trim().min(1, 'Enter a name.').max(GUEST_NAME_MAX);

const maxPeople = z
  .number()
  .int()
  .min(MAX_PEOPLE_MIN, `At least ${MAX_PEOPLE_MIN}.`)
  .max(MAX_PEOPLE_MAX, `At most ${MAX_PEOPLE_MAX}.`);

/** Any common format in, E.164 out (DATABASE_DESIGN §1.7). */
const phone = z
  .string()
  .trim()
  .max(30)
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number.' });
      return z.NEVER;
    }
    return normalized;
  });

/** Trimmed and lowercased (DATABASE_DESIGN §1.8). */
const email = z.string().trim().toLowerCase().max(EMAIL_MAX).pipe(z.email('Enter a valid email.'));

/** No duplicates, and at most one entry per event the wedding can have. */
const invitedEventIds = z
  .array(objectId)
  .max(INVITED_EVENTS_MAX)
  .transform((ids) => [...new Set(ids.map((id) => id.toLowerCase()))]);

/** Optional on create: blank means "not given" and is dropped. */
const blankToUndefined = <T extends z.ZodType>(schema: T) =>
  z
    .union([z.literal(''), schema])
    .optional()
    .transform((value) => (value === '' ? undefined : (value as z.output<T> | undefined)));

/** `POST /api/guests`. */
export const createGuestSchema = z.strictObject({
  name,
  maxPeople,
  invitedEventIds,
  side: z.enum(SIDES).optional(),
  email: blankToUndefined(email),
  phone: blankToUndefined(phone),
  notes: blankToUndefined(z.string().trim().max(NOTES_MAX)),
});
export type CreateGuestInput = z.input<typeof createGuestSchema>;

/**
 * `PATCH /api/guests/:id` (API-04): omitted = unchanged, `null` clears an optional field.
 * `invitedEventIds` replaces the whole set.
 */
export const updateGuestSchema = z.strictObject({
  name: name.optional(),
  side: z.enum(SIDES).nullable().optional(),
  email: email.nullable().optional(),
  phone: phone.nullable().optional(),
  maxPeople: maxPeople.optional(),
  invitedEventIds: invitedEventIds.optional(),
  notes: z.string().trim().max(NOTES_MAX).nullable().optional(),
});
export type UpdateGuestInput = z.input<typeof updateGuestSchema>;

/** `PATCH /api/guests/:id/rsvp`: a member records or corrects an answer (API_DESIGN §14). */
export const memberRsvpSchema = z
  .strictObject({
    status: z.enum(RSVP_STATUSES),
    attendingCount: z.number().int().min(0).max(MAX_PEOPLE_MAX).optional(),
    expectedVersion: z.number().int().min(0),
  })
  .superRefine((input, ctx) => {
    if (input.status === 'ATTENDING' && !input.attendingCount) {
      ctx.addIssue({
        code: 'custom',
        path: ['attendingCount'],
        message: 'Choose how many people are coming.',
      });
    }
  });
export type MemberRsvpInput = z.input<typeof memberRsvpSchema>;

const flag = z.enum(['true', 'false']).transform((value) => value === 'true');

/**
 * `GET /api/guests` query (API_DESIGN §5, §14). Repeatable filters arrive as arrays. Shared by the
 * route and the list page, which reads the same parameters from its URL.
 */
export const guestListQuerySchema = z.strictObject({
  search: z.string().trim().max(SEARCH_MAX).optional(),
  side: z.array(z.enum(SIDES)).optional(),
  eventId: objectId.optional(),
  rsvpStatus: z.array(z.enum(RSVP_STATUSES)).optional(),
  sent: flag.optional(),
  opened: flag.optional(),
  noEvents: z
    .literal('true')
    .transform(() => true)
    .optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).optional(),
  cursor: z.string().max(500).optional(),
});
export type GuestListQuery = z.output<typeof guestListQuerySchema>;

const REPEATABLE = new Set(['side', 'rsvpStatus']);

/** URL parameters → the shape `guestListQuerySchema` validates. Empty values are ignored. */
export function guestListQueryInput(params: URLSearchParams): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key).filter((value) => value !== '');
    if (!values.length) continue;
    input[key] = REPEATABLE.has(key) ? values : values[values.length - 1];
  }
  return input;
}

export type GuestRsvp = {
  status: RsvpStatus;
  attendingCount: number;
  respondedAt?: string;
  respondedVia?: 'GUEST_LINK' | 'MEMBER';
};

export type GuestResponse = {
  id: string;
  name: string;
  side?: Side;
  email?: string;
  phone?: string;
  maxPeople: number;
  invitedEventIds: string[];
  rsvp: GuestRsvp;
  delivery?: { sentAt: string; sentVia: 'EMAIL' | 'WHATSAPP' | 'MANUAL' };
  linkOpenedAt?: string;
  notes?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

/** The only member shape with the invitation link (API_DESIGN §14, §29). */
export type GuestDetailResponse = GuestResponse & { inviteUrl: string };

export type GuestListResponse = { items: GuestResponse[]; nextCursor?: string };

/** Guest numbers (DATABASE_DESIGN §13.1): only guests invited to at least one event count. */
export type GuestSummary = {
  invitations: number;
  peopleInvited: number;
  attending: number;
  notAttending: number;
  pending: number;
  peopleAttending: number;
  respondedViaLink: number;
  notInvitedToAnyEvent: number;
};
