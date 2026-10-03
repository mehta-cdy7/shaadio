import 'server-only';
import { redirect } from 'next/navigation';
import { currentUser } from '@/app/_lib/current-user';
import { afterSignInPath } from '../_components/after-sign-in';

/**
 * /login and /signup send someone already signed in to where sign-in would have taken them,
 * instead of showing a form that would start a second session. Not for /join or /reset-password:
 * those make sense while signed in.
 */
export async function redirectIfSignedIn(): Promise<void> {
  const session = await currentUser();
  if (session) redirect(afterSignInPath({ user: session.user }));
}
