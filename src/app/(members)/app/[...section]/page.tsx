import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { MAIN_NAV, SETTINGS_NAV, type NavItem } from '@/components/app-shell/nav-items';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/** The workspace section a path belongs to, e.g. /app/settings/members → settings. */
function sectionFor(segments: string[]): NavItem | undefined {
  const href = `/app/${segments[0]}`;
  return [...MAIN_NAV, SETTINGS_NAV].find((item) => item.href === href);
}

export async function generateMetadata({
  params,
}: PageProps<'/app/[...section]'>): Promise<Metadata> {
  const item = sectionFor((await params).section);
  if (!item) return {};
  const t = await getTranslations('members.shell.nav');
  return { title: t(item.key), robots: { index: false, follow: false } };
}

/**
 * Placeholder for workspace sections whose slice has not landed, so the nav never strands anyone
 * on a bare 404. A real page (e.g. app/events/page.tsx) takes precedence over this catch-all.
 * Paths outside the nav are still 404.
 */
export default async function ComingSoonPage({ params }: PageProps<'/app/[...section]'>) {
  const item = sectionFor((await params).section);
  if (!item) notFound();

  const t = await getTranslations('members.comingSoon');
  const tn = await getTranslations('members.shell.nav');
  const Icon = item.icon;

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <h1 className="font-display text-headline-lg-sm text-ink md:text-headline-lg">
        {tn(item.key)}
      </h1>
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft">
          <Icon width={24} height={24} />
        </span>
        <h2 className="font-display text-headline-sm text-ink">{t('title')}</h2>
        <p className="max-w-96 text-body text-pretty text-ink-muted">
          {t('body', { section: tn(item.key) })}
        </p>
        <ButtonLink href="/app" variant="outline" className="mt-2">
          {t('back')}
        </ButtonLink>
      </Card>
    </div>
  );
}
