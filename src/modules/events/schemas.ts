import { z } from 'zod';
import { addYears, isCalendarDate } from '@/lib/dates';

/** Request and response shapes for events (API_DESIGN §13). Client-safe: shared with the forms. */

export const EVENT_TYPES = [
  'ROKA',
  'ENGAGEMENT',
  'MEHENDI',
  'HALDI',
  'SANGEET',
  'COCKTAIL',
  'WEDDING',
  'RECEPTION',
  'CUSTOM',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Limits from DATABASE_DESIGN §1.12 and §5.7. */
export const EVENT_NAME_MAX = 80;
export const VENUE_NAME_MAX = 120;
export const VENUE_ADDRESS_MAX = 300;
export const MAP_URL_MAX = 500;
export const DRESS_CODE_MAX = 200;
export const EVENT_DESCRIPTION_MAX = 2000;
export const EVENTS_PER_WEDDING = 30;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 16:00.');
const date = z.string().refine(isCalendarDate, 'Choose the event date.');

/**
 * Only http(s) links: a `javascript:` URL in a guest's "Open in Maps" link would run script on the
 * invitation page.
 */
const mapUrl = z
  .string()
  .trim()
  .max(MAP_URL_MAX)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'Use a link starting with https://');

/** Optional text on create: blank means "not given" and is dropped. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

const venueSchema = z.strictObject({
  name: optionalText(VENUE_NAME_MAX),
  address: optionalText(VENUE_ADDRESS_MAX),
  mapUrl: z
    .union([z.literal(''), mapUrl])
    .optional()
    .transform((value) => value || undefined),
});

const name = z.string().trim().min(1, 'Enter the event name.').max(EVENT_NAME_MAX);

/** Reasons the form maps to its own messages (`issue.params.reason`). */
export const END_WITHOUT_START = 'END_WITHOUT_START';
export const SAME_START_AND_END = 'SAME_START_AND_END';
export const DATE_TOO_LATE = 'DATE_TOO_LATE';

/**
 * The time rule (PRD §9.5): an end time needs a start time and must differ from it. An earlier
 * end is fine: the event ends the next day.
 */
export function eventTimeProblem(
  startTime?: string | null,
  endTime?: string | null,
): typeof END_WITHOUT_START | typeof SAME_START_AND_END | undefined {
  if (!endTime) return undefined;
  if (!startTime) return END_WITHOUT_START;
  return startTime === endTime ? SAME_START_AND_END : undefined;
}

/** The latest allowed event date: one year after the wedding (PRD §9.5). No earliest date. */
export function latestEventDate(weddingDate: string): string {
  return addYears(weddingDate, 1);
}

/**
 * `POST /api/events`. The time rule is checked here; the date range needs the wedding date, so the
 * service (and the form, which knows it) check that.
 */
export const createEventSchema = z
  .strictObject({
    name,
    type: z.enum(EVENT_TYPES),
    date,
    startTime: time.optional(),
    endTime: time.optional(),
    venue: venueSchema.optional(),
    description: optionalText(EVENT_DESCRIPTION_MAX),
    dressCode: optionalText(DRESS_CODE_MAX),
  })
  .superRefine((input, ctx) => {
    const problem = eventTimeProblem(input.startTime, input.endTime);
    if (problem) {
      ctx.addIssue({
        code: 'custom',
        path: ['endTime'],
        message:
          problem === END_WITHOUT_START
            ? 'Add a start time first.'
            : 'The end time must differ from the start time.',
        params: { reason: problem },
      });
    }
  });
export type CreateEventInput = z.input<typeof createEventSchema>;

/**
 * `PATCH /api/events/:id` (API-04): omitted = unchanged, `null` clears an optional field. `venue`
 * is replaced as a whole; `null` removes it.
 */
export const updateEventSchema = z.strictObject({
  name: name.optional(),
  type: z.enum(EVENT_TYPES).optional(),
  date: date.optional(),
  startTime: time.nullable().optional(),
  endTime: time.nullable().optional(),
  venue: venueSchema.nullable().optional(),
  description: z.string().trim().max(EVENT_DESCRIPTION_MAX).nullable().optional(),
  dressCode: z.string().trim().max(DRESS_CODE_MAX).nullable().optional(),
});
export type UpdateEventInput = z.input<typeof updateEventSchema>;

export type EventVenue = { name?: string; address?: string; mapUrl?: string };

export type EventResponse = {
  id: string;
  name: string;
  type: EventType;
  date: string;
  startTime?: string;
  endTime?: string;
  venue?: EventVenue;
  description?: string;
  dressCode?: string;
  coverImageUrl?: string;
  /** Confirmed guests invited to this event (DATABASE_DESIGN §13.2). */
  headcount: { households: number; people: number };
  createdAt: string;
  updatedAt: string;
};

export type EventDeletePreview = {
  invitedCount: number;
  onlyThisEvent: { count: number; names: string[] };
  tasks: number;
  expenses: number;
  photos: number;
};
