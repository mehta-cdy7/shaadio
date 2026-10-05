import { describe, expect, it } from 'vitest';
import { createEventSchema, updateEventSchema } from '@/modules/events/schemas';
import {
  createEventBody,
  EMPTY_EVENT_FORM,
  updateEventBody,
  type EventFormValues,
} from './event-form-values';

const saved: EventFormValues = {
  ...EMPTY_EVENT_FORM,
  type: 'HALDI',
  name: 'Haldi',
  date: '2027-02-12',
  startTime: '10:00',
  venueName: 'Courtyard',
  dressCode: 'Yellow',
};

describe('event form bodies', () => {
  it('create: blank optional fields are left out and the body passes the schema', () => {
    const body = createEventBody({
      ...EMPTY_EVENT_FORM,
      type: 'ROKA',
      name: 'Roka',
      date: '2026-12-12',
    });
    expect(body).not.toHaveProperty('venue');
    expect(body).not.toHaveProperty('startTime');
    expect(createEventSchema.parse(body)).toMatchObject({ name: 'Roka', type: 'ROKA' });
  });

  it('update: sends only changes, null for cleared fields, the whole venue or null', () => {
    expect(updateEventBody(saved, { ...saved, name: 'Haldi ceremony' })).toEqual({
      name: 'Haldi ceremony',
    });
    expect(updateEventBody(saved, { ...saved, dressCode: '', startTime: '' })).toEqual({
      dressCode: null,
      startTime: null,
    });
    expect(updateEventBody(saved, { ...saved, venueName: '' })).toEqual({ venue: null });
    const body = updateEventBody(saved, { ...saved, mapUrl: 'https://maps.google.com/?q=x' });
    expect(body.venue).toEqual({
      name: 'Courtyard',
      address: '',
      mapUrl: 'https://maps.google.com/?q=x',
    });
    expect(updateEventSchema.parse(body)).toBeTruthy();
    expect(updateEventBody(saved, saved)).toEqual({});
  });
});
