import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { SettingsIcon } from '@/components/ui/icons';
import { currentMember } from '@/app/_lib/current-member';
import { ComingSoon } from '../../_components/coming-soon';
import { SETTINGS_TABS } from '../_components/settings-tabs-list';

function tabFor(segments: string[]) {
  return SETTINGS_TABS.find((tab) => tab.href === `/app/settings/${segments.join('/')}`);
}

export async function generateMetadata({
  params,
}: PageProps<'/app/settings/[...rest]'>): Promise<Metadata> {
  const tab = tabFor((await params).rest);
  if (!tab) return {};
  const t = await getTranslations('members.settings.tabs');
  return { title: t(tab.key), robots: { index: false, follow: false } };
}

/**
 * Settings tabs not built yet: Members (slice 10), Activity log (M4), Danger zone (slice 13).
 * All three are Admin-only, so a Manager gets the same 404 as an unknown path.
 */
export default async function SettingsComingSoonPage({
  params,
}: PageProps<'/app/settings/[...rest]'>) {
  const tab = tabFor((await params).rest);
  const current = await currentMember();
  if (!tab || (tab.adminOnly && current?.member?.role !== 'ADMIN')) notFound();
  const t = await getTranslations('members.settings.tabs');
  return <ComingSoon section={t(tab.key)} icon={SettingsIcon} />;
}
