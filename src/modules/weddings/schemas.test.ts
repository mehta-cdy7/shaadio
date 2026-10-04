import { describe, expect, it } from 'vitest';
import { addDays, todayIn } from '@/lib/dates';
import {
  CITY_MAX,
  createWeddingSchema,
  joinAddress,
  PAST_DATE,
  splitVenue,
  STATE_MAX,
  updateWeddingSchema,
  VENUE_MAX,
} from './schemas';

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

describe('updateWeddingSchema', () => {
  it('leaves omitted fields out and turns blank or null text into a clear', () => {
    expect(updateWeddingSchema.parse({})).toEqual({});
    expect(updateWeddingSchema.parse({ title: '  ', description: null })).toEqual({
      title: null,
      description: null,
    });
    expect(updateWeddingSchema.parse({ title: ' Shaadi ' })).toEqual({ title: 'Shaadi' });
  });

  it('rejects clearing required fields and editing server-owned ones', () => {
    for (const body of [
      { brideName: null },
      { brideName: ' ' },
      { weddingDate: null },
      { timezone: 'Asia/Dubai' },
      { website: { slug: 'x' } },
      { status: 'DELETING' },
    ]) {
      expect(updateWeddingSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe('address helpers', () => {
  it('splits the venue back out of the joined address', () => {
    const cases = [
      ['Forest Resort, Rajpur Road', 'Dehradun', 'Uttarakhand'],
      ['', 'Dehradun', 'Uttarakhand'],
      ['Forest Resort', 'Dehradun', ''],
      ['', 'Dehradun', ''],
    ] as const;
    for (const [venue, city, state] of cases) {
      const formattedAddress = joinAddress(venue, city, state);
      expect(splitVenue({ formattedAddress, city, state })).toBe(venue);
    }
  });

  it('shows an address that does not end in city and state whole', () => {
    expect(splitVenue({ formattedAddress: 'Rajpur Road, 248001', city: 'Dehradun' })).toBe(
      'Rajpur Road, 248001',
    );
  });
});
