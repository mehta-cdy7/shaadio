/**
 * Calendar dates are "YYYY-MM-DD" strings in the wedding's timezone (DATABASE_DESIGN §1.4). They
 * are never turned into instants: arithmetic runs on UTC midnights so no timezone can shift a day.
 */

const DAY_MS = 86_400_000;

/** Today's calendar date in `timeZone`, e.g. "2026-10-03" for Asia/Kolkata. */
export function todayIn(timeZone: string, now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** The hour (0–23) in `timeZone`. */
export function hourIn(timeZone: string, now = new Date()): number {
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(now)
    .find((part) => part.type === 'hour')?.value;
  return Number(hour);
}

/** UTC midnight of a calendar date, for formatting with `timeZone: 'UTC'`. */
export function calendarDateToUtc(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((calendarDateToUtc(to).getTime() - calendarDateToUtc(from).getTime()) / DAY_MS);
}

/** The calendar date `days` after `date` (before, when negative). */
export function addDays(date: string, days: number): string {
  return new Date(calendarDateToUtc(date).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** True for a real calendar date in "YYYY-MM-DD" form (rejects 2027-02-30). */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return calendarDateToUtc(value).toISOString().startsWith(value);
}

const DATE_STYLES = {
  short: { day: 'numeric', month: 'short', year: 'numeric' },
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  full: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  dayMonth: { day: 'numeric', month: 'short' },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

/**
 * A calendar date for display, day first as Indian families write it ("14 February 2027").
 * Formats in UTC so the date never shifts. `en-IN` until V1 gains other languages (PRD §12.6).
 */
export function formatCalendarDate(
  date: string,
  style: keyof typeof DATE_STYLES = 'long',
  locale = 'en-IN',
): string {
  return new Intl.DateTimeFormat(locale, { ...DATE_STYLES[style], timeZone: 'UTC' }).format(
    calendarDateToUtc(date),
  );
}

/** Day and short month as separate parts, for date tiles: { day: "10", month: "Feb" }. */
export function calendarDateParts(date: string, locale = 'en-IN') {
  const parts = new Intl.DateTimeFormat(locale, {
    ...DATE_STYLES.dayMonth,
    timeZone: 'UTC',
  }).formatToParts(calendarDateToUtc(date));
  return {
    day: parts.find((part) => part.type === 'day')?.value ?? '',
    month: parts.find((part) => part.type === 'month')?.value ?? '',
  };
}

/** "16:00" → "4:00 pm". Event times are wall-clock in the wedding's timezone (DB §1.4). */
export function formatWallTime(time: string, locale = 'en-IN'): string {
  const [hours, minutes] = time.split(':').map(Number);
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(1970, 0, 1, hours, minutes)));
}
