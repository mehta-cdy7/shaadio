import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell/app-shell';
import { currentMember } from '@/app/_lib/current-member';
import { SignOutButton } from '../_components/sign-out-button';

/**
 * The /app/* workspace (SYSTEM_DESIGN §7.1). Signed out → /login; signed in without a wedding →
 * /onboarding to create one. Pages read the wedding through `currentMember()` again (cached).
 */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const current = await currentMember();
  if (!current) redirect('/login');
  if (!current.member) redirect('/onboarding');
  const { session, member } = current;

  return (
    <AppShell
      wedding={member.wedding}
      member={{ name: session.user.name, role: member.role }}
      signOut={<SignOutButton variant="ghost" />}
    >
      {children}
    </AppShell>
  );
}
