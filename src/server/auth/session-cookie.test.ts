import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearedSessionCookie, readSessionToken, sessionCookie } from './session-cookie';

const token = 'a'.repeat(43);

describe('session cookie', () => {
  it('is HttpOnly, Secure, SameSite=Lax and lasts 30 days', () => {
    expect(sessionCookie(token)).toBe(
      `sid=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`,
    );
    expect(clearedSessionCookie()).toContain('Max-Age=0');
  });

  describe('in next dev', () => {
    afterEach(() => vi.unstubAllEnvs());

    function stubDev(origin: string) {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('APP_ORIGIN', origin);
      vi.stubEnv('MONGODB_URI', 'mongodb://localhost:27017/shaadioo-dev');
    }

    it('drops Secure on a plain-http origin so Safari keeps the cookie', () => {
      stubDev('http://localhost:3000');
      expect(sessionCookie(token)).not.toContain('Secure');
      expect(clearedSessionCookie()).not.toContain('Secure');
      expect(sessionCookie(token)).toContain('HttpOnly; SameSite=Lax');
    });

    it('keeps Secure on an https origin', () => {
      stubDev('https://dev.shaadioo.example');
      expect(sessionCookie(token)).toContain('HttpOnly; Secure; SameSite=Lax');
    });
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
