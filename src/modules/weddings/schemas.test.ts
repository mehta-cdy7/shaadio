import { describe, expect, it } from 'vitest';
import { addDays, todayIn } from '@/lib/dates';
import { CITY_MAX, createWeddingSchema, PAST_DATE, STATE_MAX, VENUE_MAX } from './schemas';

const valid = {
  brideName: ' Princi ',
  groomName: 'Akshay',
  weddingDate: addDays(todayIn('Asia/Kolkata'), 120),
  location: { formattedAddress: 'Dehradun, Uttarakhand', city: 'Dehradun, Uttarakhand' },
};

describe('createWeddingSchema', () => {
  it('trims names and drops blank optional fields', () => {
    const parsed = createWeddingSchema.parse({ ...valid, title: '  ', description: '' });
    expect(parsed.brideName).toBe('Princi');
    expect(parsed.title).toBeUndefined();
    expect(parsed.description).toBeUndefined();
  });

  it('requires both names, a real date and a city', () => {
    const result = createWeddingSchema.safeParse({
      brideName: ' ',
      groomName: '',
      weddingDate: '2027-02-30',
      location: { formattedAddress: 'x', city: ' ' },
    });
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((issue) => issue.path.join('.'));
    expect(paths).toEqual(
      expect.arrayContaining(['brideName', 'groomName', 'weddingDate', 'location.city']),
    );
  });

  it('defaults the name order to bride first', () => {
    expect(createWeddingSchema.parse(valid).nameOrder).toBe('BRIDE_FIRST');
    expect(createWeddingSchema.parse({ ...valid, nameOrder: 'GROOM_FIRST' }).nameOrder).toBe(
      'GROOM_FIRST',
    );
    expect(createWeddingSchema.safeParse({ ...valid, nameOrder: 'EITHER' }).success).toBe(false);
  });

  it('accepts today and rejects past dates, in the wedding timezone', () => {
    const today = todayIn('Asia/Kolkata');
    expect(createWeddingSchema.safeParse({ ...valid, weddingDate: today }).success).toBe(true);
    const past = createWeddingSchema.safeParse({ ...valid, weddingDate: addDays(today, -1) });
    expect(past.success).toBe(false);
    expect(past.error!.issues[0]).toMatchObject({
      path: ['weddingDate'],
      params: { reason: PAST_DATE },
    });
  });

  it('rejects an unknown timezone', () => {
    expect(createWeddingSchema.safeParse({ ...valid, timezone: 'Mars/Olympus' }).success).toBe(
      false,
    );
  });

  it('the longest venue, city and state still fit the address limit', () => {
    const location = {
      city: 'c'.repeat(CITY_MAX),
      state: 's'.repeat(STATE_MAX),
      formattedAddress: ['v'.repeat(VENUE_MAX), 'c'.repeat(CITY_MAX), 's'.repeat(STATE_MAX)].join(
        ', ',
      ),
    };
    expect(createWeddingSchema.safeParse({ ...valid, location }).success).toBe(true);
  });

  it('rejects unknown fields (API_DESIGN §1.4)', () => {
    expect(createWeddingSchema.safeParse({ ...valid, weddingId: 'x' }).success).toBe(false);
  });
});
