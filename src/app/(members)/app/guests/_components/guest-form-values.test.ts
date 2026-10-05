import { describe, expect, it } from 'vitest';
import {
  createGuestBody,
  EMPTY_GUEST_FORM,
  sameGuestValues,
  updateGuestBody,
  type GuestFormValues,
} from './guest-form-values';

const saved: GuestFormValues = {
  name: 'Sharma Family',
  side: 'BRIDE',
  phone: '+919811234567',
  email: 'sharma@example.com',
  maxPeople: 4,
  invitedEventIds: ['a', 'b'],
  notes: 'Ground floor',
};

describe('createGuestBody', () => {
  it('leaves blanks out', () => {
    expect(createGuestBody({ ...EMPTY_GUEST_FORM, name: 'Verma', phone: '  ' })).toEqual({
      name: 'Verma',
      maxPeople: 1,
      invitedEventIds: [],
    });
  });
});

describe('updateGuestBody', () => {
  it('sends only what changed', () => {
    expect(updateGuestBody(saved, { ...saved, maxPeople: 5 })).toEqual({ maxPeople: 5 });
  });

  it('ignores the order of invited events', () => {
    expect(updateGuestBody(saved, { ...saved, invitedEventIds: ['b', 'a'] })).toEqual({});
    expect(sameGuestValues(saved, { ...saved, invitedEventIds: ['b', 'a'] })).toBe(true);
  });

  it('clears emptied optional fields with null', () => {
    expect(updateGuestBody(saved, { ...saved, side: '', phone: '', notes: ' ' })).toEqual({
      side: null,
      phone: null,
      notes: null,
    });
  });
});
