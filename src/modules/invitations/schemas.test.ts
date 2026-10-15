import { describe, expect, it } from 'vitest';
import { createCampaignSchema } from './schemas';

describe('createCampaignSchema', () => {
  it('accepts invitation campaigns, optionally for chosen guests', () => {
    expect(createCampaignSchema.safeParse({ kind: 'GUEST_INVITATION' }).success).toBe(true);
    expect(
      createCampaignSchema.safeParse({
        kind: 'GUEST_INVITATION',
        guestIds: ['0123456789abcdef01234567'],
      }).success,
    ).toBe(true);
  });

  it('rejects reminders (V2), bad ids, empty lists and extra fields', () => {
    for (const body of [
      { kind: 'RSVP_REMINDER' },
      { kind: 'GUEST_INVITATION', guestIds: ['nope'] },
      { kind: 'GUEST_INVITATION', guestIds: [] },
      { kind: 'GUEST_INVITATION', weddingId: 'x' },
      {},
    ]) {
      expect(createCampaignSchema.safeParse(body).success).toBe(false);
    }
  });
});
