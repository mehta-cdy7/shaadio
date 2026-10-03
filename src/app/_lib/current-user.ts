import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { resolveSession } from '@/modules/auth';
import { readSessionToken } from '@/server/auth/session-cookie';

/**
 * The signed-in user for a server component, or undefined. Resolves the same session the route
 * handlers do (`withUser`), once per request. Server components cannot set cookies, so a sliding
 * refresh here is only sent back on the next API call.
 */
export const currentUser = cache(async () => {
  const token = readSessionToken((await headers()).get('cookie'));
  return resolveSession(token);
});
