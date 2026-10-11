import type { Metadata } from 'next';
import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CalendarIcon, ClockIcon, ExternalLinkIcon, MapPinIcon } from '@/components/ui/icons';
import { coupleNames } from '@/lib/couple';
import { cn } from '@/lib/cn';
import { formatCalendarDate, formatTimeRange } from '@/lib/dates';
import { findPublicWebsite } from '@/modules/weddings';
import type { PublicWebsite } from '@/modules/weddings/schemas';

/**
 * One load per request, shared by the metadata and the page. A draft, a deleting wedding and an
 * unknown slug are all the generic not-found page (SYSTEM_DESIGN §26).
 */
const loadWebsite = cache(async (slug: string): Promise<PublicWebsite> => {
  const website = await findPublicWebsite(slug);
  if (!website) notFound();
  return website;
});

export async function generateMetadata({ params }: PageProps<'/w/[slug]'>): Promise<Metadata> {
  const t = await getTranslations('website');
  const website = await loadWebsite((await params).slug);
  return { title: { absolute: t('metaTitle', { couple: coupleNames(website).join(' & ') }) } };
}

/**
 * The couple's unlisted wedding website (PRD §9.18–9.19, SYSTEM_DESIGN §26–28, Stitch "Public
 * Wedding Website"). Server-rendered with no client JavaScript, rendered on every request so
 * unpublishing is immediate. Shows all events; never links to the gallery or any invitation.
 * Cover photo, featured photos and livestream arrive with Milestone 2.
 */
export default async function WeddingWebsitePage({ params }: PageProps<'/w/[slug]'>) {
  const website = await loadWebsite((await params).slug);
  const t = await getTranslations('website');
  const [first, second] = coupleNames(website);
  const hasWelcome = Boolean(website.welcomeMessage || website.description);

  return (
    <div data-theme={website.theme.toLowerCase()} className="min-h-dvh bg-canvas text-ink">
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 md:gap-12 md:px-8 md:py-14">
        <header className="rounded-t-arch rounded-b-card border border-line bg-surface px-6 pt-12 pb-10 text-center shadow-card md:px-12 md:pt-16 md:pb-12">
          <span
            aria-hidden
            className="mx-auto flex size-12 items-center justify-center rounded-full bg-pending text-title text-secondary-ink"
          >
            ✦
          </span>
          <p className="mt-5 text-label-sm font-semibold tracking-widest text-secondary-ink uppercase">
            {website.title ?? t('eyebrow')}
          </p>
          <h1 className="mt-3 font-display text-headline-lg-sm [overflow-wrap:anywhere] text-ink md:text-display-sm">
            {first} <span className="text-secondary-ink italic">&amp;</span> {second}
          </h1>
          <div aria-hidden className="mx-auto mt-5 h-px w-16 bg-secondary" />
          <p className="mt-5 flex flex-col items-center justify-center gap-2 text-body-lg text-ink sm:flex-row sm:gap-5">
            <span className="inline-flex items-center gap-2">
              <CalendarIcon width={18} height={18} className="text-secondary-ink" />
              {formatCalendarDate(website.weddingDate, 'full')}
            </span>
            <span aria-hidden className="hidden text-ink-muted sm:inline">
              ·
            </span>
            <span className="inline-flex items-center gap-2">
              <MapPinIcon width={18} height={18} className="text-secondary-ink" />
              {website.city}
            </span>
          </p>
        </header>

        {hasWelcome && (
          <section
            aria-labelledby="welcome-title"
            className="rounded-card border border-line bg-surface p-6 shadow-card md:p-10"
          >
            <h2 id="welcome-title" className="font-display text-headline-sm text-ink">
              {t('welcomeTitle')}
            </h2>
            {website.welcomeMessage && (
              <p className="mt-4 text-body-lg whitespace-pre-line text-ink">
                {website.welcomeMessage}
              </p>
            )}
            {website.description && (
              <p className="mt-4 text-body whitespace-pre-line text-ink-muted">
                {website.description}
              </p>
            )}
          </section>
        )}

        <section aria-labelledby="events-title" className="flex flex-col gap-5">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
            <h2
              id="events-title"
              className="font-display text-headline-sm text-ink md:text-headline-md"
            >
              {t('eventsTitle')}
            </h2>
            {website.events.length > 0 && (
              <p className="rounded-full bg-pending px-3 py-1 text-label font-semibold text-on-pending">
                {t('eventsCount', { count: website.events.length })}
              </p>
            )}
          </div>

          {website.events.length === 0 ? (
            <p className="rounded-card border border-line bg-surface p-6 text-body text-ink-muted">
              {t('noEvents')}
            </p>
          ) : (
            <ol className="grid gap-4 border-l border-secondary/60 pl-4 md:grid-cols-2 md:border-0 md:pl-0">
              {website.events.map((event, index) => {
                const time = formatTimeRange(event.startTime, event.endTime);
                const main = event.type === 'WEDDING';
                return (
                  <li
                    key={index}
                    className={cn(
                      'relative flex flex-col gap-3 rounded-card border bg-surface p-5 shadow-card md:p-6',
                      main ? 'border-secondary' : 'border-line',
                    )}
                  >
                    <span
                      aria-hidden
                      className="absolute top-7 -left-[1.4rem] size-2 rounded-full bg-secondary md:hidden"
                    />
                    <p
                      className={cn(
                        'self-start rounded-full px-3 py-1 text-label font-semibold',
                        main ? 'bg-primary text-on-primary' : 'bg-fill text-ink',
                      )}
                    >
                      {formatCalendarDate(event.date, 'full')}
                    </p>
                    <h3 className="font-display text-headline-sm [overflow-wrap:anywhere] text-ink">
                      {event.name}
                    </h3>
                    <p className="flex items-center gap-2 text-body-lg font-medium text-ink">
                      <ClockIcon width={18} height={18} className="shrink-0 text-secondary-ink" />
                      {time ?? (
                        <span className="font-normal text-ink-muted italic">{t('timeTba')}</span>
                      )}
                    </p>
                    {(event.venue?.name || event.venue?.address) && (
                      <p className="flex flex-col text-body [overflow-wrap:anywhere]">
                        {event.venue.name && <span className="text-ink">{event.venue.name}</span>}
                        {event.venue.address && (
                          <span className="text-ink-muted">{event.venue.address}</span>
                        )}
                      </p>
                    )}
                    {(event.dressCode || event.venue?.mapUrl) && (
                      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                        {event.dressCode ? (
                          <p className="rounded-full bg-pending px-3 py-1 text-label font-semibold [overflow-wrap:anywhere] text-on-pending">
                            {t('dressCode', { dressCode: event.dressCode })}
                          </p>
                        ) : (
                          <span />
                        )}
                        {event.venue?.mapUrl && (
                          <a
                            href={event.venue.mapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-body-sm font-semibold text-secondary-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                          >
                            {t('openInMaps')}
                            <ExternalLinkIcon width={14} height={14} />
                          </a>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <footer className="flex flex-col items-center gap-1 border-t border-line pt-8 text-center">
          <p className="font-display text-title text-ink">
            {first} &amp; {second}
          </p>
          <p className="text-label text-ink-muted">
            {t.rich('madeWith', {
              brand: (chunks) => (
                <Link href="/" className="font-semibold text-ink hover:underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </footer>
      </main>
    </div>
  );
}
