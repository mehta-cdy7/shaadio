import { describe, expect, it } from 'vitest';
import { inviteMemberSchema, updateMemberSchema } from './schemas';

describe('inviteMemberSchema', () => {
  it('lowercases the email and drops a blank label', () => {
    expect(
      inviteMemberSchema.parse({ email: ' Meera@Example.COM ', role: 'ADMIN', label: '  ' }),
    ).toEqual({ email: 'meera@example.com', role: 'ADMIN', label: undefined });
  });

  it('rejects unknown roles, long labels and extra fields', () => {
    const base = { email: 'meera@example.com', role: 'MANAGER' };
    expect(inviteMemberSchema.safeParse({ ...base, role: 'OWNER' }).success).toBe(false);
    expect(inviteMemberSchema.safeParse({ ...base, label: 'x'.repeat(61) }).success).toBe(false);
    expect(inviteMemberSchema.safeParse({ ...base, weddingId: 'w1' }).success).toBe(false);
  });
});

describe('updateMemberSchema', () => {
  it('treats null or blank as clearing the label', () => {
    expect(updateMemberSchema.parse({ label: null })).toEqual({ label: null });
    expect(updateMemberSchema.parse({ label: ' ' })).toEqual({ label: null });
  });

  it('needs at least one change', () => {
    expect(updateMemberSchema.safeParse({}).success).toBe(false);
  });
});
