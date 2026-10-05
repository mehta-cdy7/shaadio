import { describe, expect, it } from 'vitest';
import {
  createEventSchema,
  END_WITHOUT_START,
  eventTimeProblem,
  latestEventDate,
  SAME_START_AND_END,
} from './schemas';

describe('event rules', () => {
  it('an end time needs a different start time; an earlier end is the next day', () => {
    expect(eventTimeProblem(undefined, '23:00')).toBe(END_WITHOUT_START);
    expect(eventTimeProblem('', '23:00')).toBe(END_WITHOUT_START);
    expect(eventTimeProblem('18:00', '18:00')).toBe(SAME_START_AND_END);
    expect(eventTimeProblem('20:00', '01:00')).toBeUndefined();
    expect(eventTimeProblem('18:00')).toBeUndefined();
    expect(eventTimeProblem()).toBeUndefined();
  });

  it('the latest event date is a year after the wedding', () => {
    expect(latestEventDate('2027-02-14')).toBe('2028-02-14');
  });

  it('the create schema applies the time rule to endTime', () => {
    const result = createEventSchema.safeParse({
      name: 'Cocktail',
      type: 'COCKTAIL',
      date: '2027-02-12',
      endTime: '23:00',
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]).toMatchObject({
      path: ['endTime'],
      params: { reason: END_WITHOUT_START },
    });
  });
});
