import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Logo } from '@/components/ui/logo';
import { currentMember } from '@/app/_lib/current-member';
import { SignOutButton } from '../_components/sign-out-button';
import { CreateWedding } from './_components/create-wedding';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('members.onboarding');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/**
 * Where a signed-in user without a wedding lands (SYSTEM_DESIGN §7.1, PRD §9.2). Users who already
 * belong to a wedding go straight to the workspace.
 */
export default async function OnboardingPage() {
  const current = await currentMember();
  if (!current) redirect('/login');
  if (current.member) redirect('/app');
  const { session } = current;

  const t = await getTranslations('members.onboarding');
  const tf = await getTranslations('auth.footer');

  const header = (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <Logo />
      <div className="flex items-center gap-1 text-body-sm text-ink-muted">
        <span className="max-w-48 truncate sm:max-w-none">
          {t('signedInAs', { email: session.user.email })}
        </span>
        <SignOutButton variant="ghost" />
      </div>
    </header>
  );

  const footer = (
    <footer className="border-t border-line pt-6">
      <nav aria-label={tf('label')} className="flex justify-center gap-3 text-label text-ink-muted">
        <Link href="/" className="hover:text-ink-accent hover:underline">
          {tf('home')}
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/#privacy" className="hover:text-ink-accent hover:underline">
          {tf('privacy')}
        </Link>
      </nav>
    </footer>
  );

  return <CreateWedding header={header} footer={footer} />;
}
