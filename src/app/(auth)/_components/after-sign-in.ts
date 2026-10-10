import type { MeResponse } from '@/modules/auth/schemas';

/** The only `?next=` targets: a member invitation link. Anything else is ignored (no open redirect). */
const NEXT_PATTERN = /^\/join\/[A-Za-z0-9_-]{1,100}$/;

/** `next` if it is an allowed return path, otherwise undefined. */
export function safeNext(next: unknown): string | undefined {
  return typeof next === 'string' && NEXT_PATTERN.test(next) ? next : undefined;
}

/**
 * Where a signed-in user lands (API_DESIGN §10 `GET /api/me`): back to the invitation they came
 * from, else the workspace if they belong to a wedding, otherwise "create or join a wedding"
 * (SYSTEM_DESIGN §7.1).
 */
export function afterSignInPath(me: MeResponse, next?: string): string {
  return safeNext(next) ?? (me.wedding ? '/app' : '/onboarding');
}
