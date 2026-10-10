import { describe, expect, it } from 'vitest';
import { afterSignInPath, safeNext } from './after-sign-in';

const user = { id: 'u1', name: 'Meera', email: 'meera@example.com' };
const wedding = {
  id: 'w1',
  brideName: 'Princi',
  groomName: 'Akshay',
  nameOrder: 'BRIDE_FIRST' as const,
  weddingDate: '2027-02-14',
};

describe('safeNext', () => {
  it('allows only a member invitation path', () => {
    expect(safeNext('/join/abc_DEF-123')).toBe('/join/abc_DEF-123');
    for (const value of [
      'https://evil.example/join/x',
      '//evil.example',
      '/app',
      '/join/',
      '/join/a/b',
      '/join/x?y=1',
      undefined,
      ['/join/x'],
    ]) {
      expect(safeNext(value)).toBeUndefined();
    }
  });
});

describe('afterSignInPath', () => {
  it('returns to the invitation first, then the workspace or onboarding', () => {
    expect(afterSignInPath({ user, wedding }, '/join/tok')).toBe('/join/tok');
    expect(afterSignInPath({ user, wedding }, '//evil.example')).toBe('/app');
    expect(afterSignInPath({ user })).toBe('/onboarding');
  });
});
