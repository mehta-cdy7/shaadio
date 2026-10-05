import { describe, expect, it } from 'vitest';
import { formatPhone, normalizePhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['9811234567', '+919811234567'],
    ['98112 34567', '+919811234567'],
    ['098112-34567', '+919811234567'],
    ['+91 98112 34567', '+919811234567'],
    ['+91-98112-34567', '+919811234567'],
    ['0091 98112 34567', '+919811234567'],
    ['919811234567', '+919811234567'],
    ['(0135) 274 6000', '+911352746000'],
    ['+44 20 7946 0958', '+442079460958'],
    ['+1 (415) 555-0132', '+14155550132'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['', 'abc', '12345', '98112345678', '+91 12345', '+0 1234 5678', '+12 34', '98112x4567'])(
    'rejects %j',
    (input) => {
      expect(normalizePhone(input)).toBeUndefined();
    },
  );
});

describe('formatPhone', () => {
  it('groups Indian numbers 5 + 5', () => {
    expect(formatPhone('+919811234567')).toBe('+91 98112 34567');
  });

  it('leaves other numbers as stored', () => {
    expect(formatPhone('+442079460958')).toBe('+442079460958');
  });
});
