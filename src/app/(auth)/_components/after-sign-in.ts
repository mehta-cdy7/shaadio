import type { MeResponse } from '@/modules/auth/schemas';

/**
 * Where a signed-in user lands (API_DESIGN §10 `GET /api/me`): the workspace if they belong to a
 * wedding, otherwise "create or join a wedding" (SYSTEM_DESIGN §7.1). Both pages arrive in slice 2.
 */
export function afterSignInPath(me: MeResponse): string {
  return me.wedding ? '/app' : '/onboarding';
}
