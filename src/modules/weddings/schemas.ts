import { z } from 'zod';
import { isCalendarDate, todayIn } from '@/lib/dates';

/** Request and response shapes for the wedding (API_DESIGN §11). Client-safe: shared with forms. */

export const COUPLE_NAME_MAX = 80;
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 2000;
export const CITY_MAX = 120;
export const STATE_MAX = 80;
export const ADDRESS_MAX = 300;
/** The form joins "venue, city, state" into formattedAddress; the venue gets what is left. */
export const VENUE_MAX = ADDRESS_MAX - CITY_MAX - STATE_MAX - ', '.length * 2;
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export const NAME_ORDERS = ['BRIDE_FIRST', 'GROOM_FIRST'] as const;
export type NameOrder = (typeof NAME_ORDERS)[number];

const calendarDate = z.string().refine(isCalendarDate, 'Choose a date.');

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Optional text: blank input means "not given", so it is dropped rather than stored empty. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

export const locationSchema = z.strictObject({
  formattedAddress: z.string().trim().min(1).max(ADDRESS_MAX),
  city: z.string().trim().min(1, 'Enter the city.').max(CITY_MAX),
  state: optionalText(STATE_MAX),
  country: optionalText(80),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  googlePlaceId: optionalText(300),
});

/** Code for the "today or later" rule, so the form can show its own message for it. */
export const PAST_DATE = 'PAST_DATE';

/** The wedding's own fields, without the date rule (the edit form reuses them as they are). */
export const weddingFieldsSchema = z.strictObject({
  brideName: z.string().trim().min(1, "Enter the bride's name.").max(COUPLE_NAME_MAX),
  groomName: z.string().trim().min(1, "Enter the groom's name.").max(COUPLE_NAME_MAX),
  nameOrder: z.enum(NAME_ORDERS).default('BRIDE_FIRST'),
  weddingDate: calendarDate,
  location: locationSchema,
  title: optionalText(TITLE_MAX),
  description: optionalText(DESCRIPTION_MAX),
  timezone: z.string().min(1).max(64).refine(isTimeZone, 'Unknown timezone.').optional(),
});

/** Today or later in the wedding's own timezone (PRD §9.2). */
export function isPastWeddingDate(weddingDate: string, timezone = DEFAULT_TIMEZONE): boolean {
  return isCalendarDate(weddingDate) && weddingDate < todayIn(timezone);
}

export const createWeddingSchema = weddingFieldsSchema.superRefine((input, ctx) => {
  // Checked in the browser and again on the server, which uses its own clock.
  if (input.timezone && !isTimeZone(input.timezone)) return;
  if (isPastWeddingDate(input.weddingDate, input.timezone)) {
    ctx.addIssue({
      code: 'custom',
      path: ['weddingDate'],
      message: 'Choose today or a later date.',
      params: { reason: PAST_DATE },
    });
  }
});
export type CreateWeddingInput = z.input<typeof createWeddingSchema>;

/** Clearable text for PATCH: `null` or blank clears it (stored as absent), a string sets it. */
const clearableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => value || null);

/**
 * `PATCH /api/wedding` (API_DESIGN §11, API-04): every field optional; omitted means unchanged and
 * `null` clears an optional field. `location` is replaced as a whole. The "today or later" rule
 * for a new `weddingDate` needs the wedding's stored timezone, so the service checks it.
 * `timezone` is not editable, so it is rejected like any unknown field.
 */
export const updateWeddingSchema = z.strictObject({
  brideName: z.string().trim().min(1, "Enter the bride's name.").max(COUPLE_NAME_MAX).optional(),
  groomName: z.string().trim().min(1, "Enter the groom's name.").max(COUPLE_NAME_MAX).optional(),
  nameOrder: z.enum(NAME_ORDERS).optional(),
  weddingDate: calendarDate.optional(),
  location: locationSchema.optional(),
  title: clearableText(TITLE_MAX).optional(),
  description: clearableText(DESCRIPTION_MAX).optional(),
  rsvpDeadline: calendarDate.nullable().optional(),
});
export type UpdateWeddingInput = z.input<typeof updateWeddingSchema>;

/** The form's venue, city and state as one address line: "venue, city, state". */
export function joinAddress(venue: string, city: string, state: string): string {
  return [venue, city, state].filter(Boolean).join(', ');
}

/**
 * The venue part of a stored address, for editing: what is left before ", city, state". An
 * address that does not end that way (e.g. one chosen through Places later) is shown whole.
 */
export function splitVenue(location: Pick<WeddingLocation, 'formattedAddress' | 'city' | 'state'>) {
  const place = joinAddress('', location.city, location.state ?? '');
  const address = location.formattedAddress;
  if (address === place) return '';
  return address.endsWith(`, ${place}`) ? address.slice(0, -place.length - 2) : address;
}

export type WeddingLocation = {
  formattedAddress: string;
  city: string;
  state?: string;
  country?: string;
  lat?: number;
  lng?: number;
  googlePlaceId?: string;
};

export type WeddingResponse = {
  id: string;
  brideName: string;
  groomName: string;
  nameOrder: NameOrder;
  title?: string;
  description?: string;
  weddingDate: string;
  timezone: string;
  location: WeddingLocation;
  coverImageUrl?: string;
  rsvpDeadline?: string;
  rsvpLocked: boolean;
  isEmpty: boolean;
  createdAt: string;
};
