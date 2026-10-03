import 'server-only';
import { cache } from 'react';
import { resolveMember } from '@/modules/weddings';
import { currentUser } from './current-user';

/**
 * The signed-in user and their membership for a server component, resolved once per request with
 * the same rules as `withMember` (API_DESIGN §3.2, API-08). `member` is undefined without a wedding.
 */
export const currentMember = cache(async () => {
  const session = await currentUser();
  if (!session) return undefined;
  return { session, member: await resolveMember(session.userId) };
});
