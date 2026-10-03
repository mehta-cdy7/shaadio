import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { Logo } from '@/components/ui/logo';
import { Eyebrow, Heading, Lead } from '@/components/ui/typography';
import { SignOutButton } from '../_components/sign-out-button';
import { currentUser } from '@/app/_lib/current-user';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('members.onboarding');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/**
 * Placeholder landing after sign-in or sign-up. Slice 2 replaces it with "create or join a
 * wedding" (PRD §9.2); until then it proves the session works and offers sign-out.
 */
export default async function OnboardingPage() {
  const session = await currentUser();
  if (!session) redirect('/login');

  const t = await getTranslations('members.onboarding');
  const { name, email } = session.user;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex items-center justify-between border-b border-line px-4 py-4 sm:px-8">
        <Logo />
        <SignOutButton />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="flex w-full max-w-lg flex-col gap-4 text-center">
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <Heading as="h1" size="headline-lg">
            {t('title', { name })}
          </Heading>
          <Lead>{t('body')}</Lead>
          <p className="text-body-sm text-ink-muted">{t('signedInAs', { email })}</p>
        </Card>
      </main>
    </div>
  );
}
