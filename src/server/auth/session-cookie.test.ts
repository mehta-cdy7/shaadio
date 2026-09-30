import { describe, expect, it } from 'vitest';
import { clearedSessionCookie, readSessionToken, sessionCookie } from './session-cookie';

const token = 'a'.repeat(43);

describe('session cookie', () => {
  it('is HttpOnly, Secure, SameSite=Lax and lasts 30 days', () => {
    expect(sessionCookie(token)).toBe(
      `sid=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`,
    );
    expect(clearedSessionCookie()).toContain('Max-Age=0');
  });

  it('reads the token from a Cookie header', () => {
    expect(readSessionToken(`theme=dark; sid=${token}; other=1`)).toBe(token);
  });

  it('ignores a missing, empty or malformed token', () => {
    expect(readSessionToken(null)).toBeUndefined();
    expect(readSessionToken('theme=dark')).toBeUndefined();
    expect(readSessionToken('sid=')).toBeUndefined();
    expect(readSessionToken('sid=short')).toBeUndefined();
    expect(readSessionToken(`sid=${token}$`)).toBeUndefined();
  });
});
