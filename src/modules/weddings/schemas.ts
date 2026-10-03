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

export const createWeddingSchema = z
  .strictObject({
    brideName: z.string().trim().min(1, "Enter the bride's name.").max(COUPLE_NAME_MAX),
    groomName: z.string().trim().min(1, "Enter the groom's name.").max(COUPLE_NAME_MAX),
    nameOrder: z.enum(NAME_ORDERS).default('BRIDE_FIRST'),
    weddingDate: calendarDate,
    location: locationSchema,
    title: optionalText(TITLE_MAX),
    description: optionalText(DESCRIPTION_MAX),
    timezone: z.string().min(1).max(64).refine(isTimeZone, 'Unknown timezone.').optional(),
  })
  .superRefine((input, ctx) => {
    // Today or later in the wedding's own timezone (PRD §9.2). Checked in the browser and again on
    // the server, which uses its own clock.
    if (!isCalendarDate(input.weddingDate) || (input.timezone && !isTimeZone(input.timezone))) {
      return;
    }
    if (input.weddingDate < todayIn(input.timezone ?? DEFAULT_TIMEZONE)) {
      ctx.addIssue({
        code: 'custom',
        path: ['weddingDate'],
        message: 'Choose today or a later date.',
        params: { reason: PAST_DATE },
      });
    }
  });
export type CreateWeddingInput = z.input<typeof createWeddingSchema>;

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
