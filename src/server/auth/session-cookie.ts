import 'server-only';

/** The session cookie (API_DESIGN §2.1). It carries only a random token, never authorization data. */
export const SESSION_COOKIE = 'sid';
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/** Reads the session token from a Cookie header. Returns undefined when absent or malformed. */
export function readSessionToken(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1 || part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    // newToken() output: 32 bytes as base64url is exactly 43 characters.
    return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
  }
  return undefined;
}
