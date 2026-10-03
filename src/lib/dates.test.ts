import { describe, expect, it } from 'vitest';
import {
  addDays,
  calendarDateParts,
  daysBetween,
  formatCalendarDate,
  formatWallTime,
  hourIn,
  isCalendarDate,
  todayIn,
} from './dates';

describe('dates', () => {
  it('todayIn uses the given timezone, not UTC', () => {
    // 20:00 UTC on 3 Oct is already 4 Oct in India.
    const now = new Date('2026-10-03T20:00:00Z');
    expect(todayIn('Asia/Kolkata', now)).toBe('2026-10-04');
    expect(todayIn('UTC', now)).toBe('2026-10-03');
  });

  it('hourIn uses the given timezone', () => {
    expect(hourIn('Asia/Kolkata', new Date('2026-10-03T20:00:00Z'))).toBe(1);
  });

  it('daysBetween counts calendar days in both directions', () => {
    expect(daysBetween('2026-10-03', '2027-02-14')).toBe(134);
    expect(daysBetween('2027-02-14', '2027-02-14')).toBe(0);
    expect(daysBetween('2027-02-15', '2027-02-14')).toBe(-1);
    // Across the March DST change in other zones: still whole days.
    expect(daysBetween('2027-03-01', '2027-04-01')).toBe(31);
  });

  it('addDays crosses month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
  });

  it('isCalendarDate rejects malformed and impossible dates', () => {
    expect(isCalendarDate('2027-02-14')).toBe(true);
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(isCalendarDate('2027-02-29')).toBe(false);
    expect(isCalendarDate('14-02-2027')).toBe(false);
    expect(isCalendarDate('')).toBe(false);
  });
});

describe('formatting', () => {
  it('writes dates day first and never shifts the day', () => {
    expect(formatCalendarDate('2027-02-14')).toBe('14 February 2027');
    expect(formatCalendarDate('2027-02-14', 'short')).toBe('14 Feb 2027');
    expect(formatCalendarDate('2027-02-14', 'full')).toBe('Sunday, 14 February 2027');
    expect(calendarDateParts('2027-02-10')).toEqual({ day: '10', month: 'Feb' });
  });

  it('writes wall-clock times in 12-hour form', () => {
    expect(formatWallTime('16:00')).toBe('4:00 pm');
    expect(formatWallTime('09:05')).toBe('9:05 am');
  });
});
