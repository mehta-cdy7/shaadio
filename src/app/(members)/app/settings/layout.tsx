import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { currentMember } from '@/app/_lib/current-member';
import { SettingsTabs } from './_components/settings-tabs';

/** Settings (PRD §9.25): title and section tabs around each settings page. */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const current = await currentMember();
  // The /app layout has already redirected; this narrows the type.
  if (!current?.member) redirect('/onboarding');
  const t = await getTranslations('members.settings');

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-headline-lg-sm text-ink md:text-headline-lg">
          {t('title')}
        </h1>
        <SettingsTabs isAdmin={current.member.role === 'ADMIN'} />
      </div>
      {children}
    </div>
  );
}
