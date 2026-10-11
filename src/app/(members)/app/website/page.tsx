import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { currentMember } from '@/app/_lib/current-member';
import { coupleNames } from '@/lib/couple';
import { cn } from '@/lib/cn';
import { getWebsite } from '@/modules/weddings';
import { AVAILABLE_THEMES, WEBSITE_THEMES } from '@/modules/weddings/schemas';
import { PublishCard } from './_components/publish-card';
import { WelcomeMessageCard } from './_components/welcome-message-card';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('members.website');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/**
 * Website (PRD §9.18–9.19): publish or unpublish, share the link, edit the welcome message, pick a
 * theme. Any member. Same service as `GET /api/website` (API-08).
 */
export default async function WebsitePage() {
  const current = await currentMember();
  if (!current?.member) redirect('/onboarding');
  const t = await getTranslations('members.website');
  const website = await getWebsite({ weddingId: current.member.weddingId });

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <header>
        <h1 className="font-display text-headline-lg-sm text-ink md:text-headline-lg">
          {t('title')}
        </h1>
        <p className="mt-1 max-w-prose text-body-lg text-ink-muted">{t('lead')}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          <PublishCard website={website} couple={coupleNames(current.member.wedding)} />
          <WelcomeMessageCard initial={website.welcomeMessage ?? ''} />
        </div>
        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="font-display text-headline-sm text-ink">{t('theme.title')}</h2>
            <ul className="mt-4 flex flex-col gap-3">
              {WEBSITE_THEMES.map((theme) => {
                const available = (AVAILABLE_THEMES as readonly string[]).includes(theme);
                const selected = website.theme === theme;
                return (
                  <li
                    key={theme}
                    aria-current={selected ? 'true' : undefined}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-control border p-3.5',
                      selected ? 'border-primary bg-primary-subtle' : 'border-line',
                      !available && 'opacity-60',
                    )}
                  >
                    <span className="text-body font-medium text-ink">
                      {t(`theme.names.${theme}`)}
                    </span>
                    {selected ? (
                      <Badge size="sm" tone="soft">
                        {t('theme.selected')}
                      </Badge>
                    ) : (
                      !available && (
                        <Badge size="sm" tone="neutral">
                          {t('theme.comingSoon')}
                        </Badge>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
          <p className="rounded-card bg-canvas-muted p-4 text-body text-ink-muted">
            {t('allEventsNote')}
          </p>
        </div>
      </div>
    </div>
  );
}
