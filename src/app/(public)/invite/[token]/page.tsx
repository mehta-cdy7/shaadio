import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ExternalLinkIcon, MapPinIcon } from '@/components/ui/icons';
import { coupleNames } from '@/lib/couple';
import { formatCalendarDate, formatTimeRange } from '@/lib/dates';
import { getInvitation } from '@/modules/invitations';
import type { InvitationResponse } from '@/modules/invitations/schemas';
import { consume } from '@/server/rate-limit/rate-limit';
import { OpenedBeacon } from './_components/opened-beacon';
import { RsvpForm } from './_components/rsvp-form';

/**
 * One load per request, shared by the metadata and the page. Every failure to open the link is the
 * generic not-found page (API_DESIGN §30).
 */
const loadInvitation = cache(async (token: string): Promise<InvitationResponse> => {
  try {
    const ip = (await headers()).get('x-real-ip') ?? 'unknown';
    await consume({ scope: 'invite-get', key: ip, limit: 120, windowSeconds: 60 });
    return await getInvitation(token);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'NOT_FOUND' || code === 'RATE_LIMITED') notFound();
    throw error;
  }
});

export async function generateMetadata({
  params,
}: PageProps<'/invite/[token]'>): Promise<Metadata> {
  const { token } = await params;
  const t = await getTranslations('invite');
  const invitation = await loadInvitation(token);
  return {
    title: { absolute: t('metaTitle', { couple: coupleNames(invitation.wedding).join(' & ') }) },
  };
}

/**
 * The guest's invitation (PRD §9.10–9.11, Stitch "Wedding Invitation"). Server-rendered with one
 * small client island, the RSVP form, for budget phones on 4G (SYSTEM_DESIGN §3.6). The render never
 * marks the link opened; `OpenedBeacon` does, from a real browser (API_DESIGN §24).
 */
export default async function InvitePage({ params }: PageProps<'/invite/[token]'>) {
  const { token } = await params;
  const invitation = await loadInvitation(token);
  const t = await getTranslations('invite');
  const { wedding, guest, events } = invitation;
  const [first, second] = coupleNames(wedding);

  return (
    <main className="min-h-dvh bg-canvas px-4 py-8 text-ink md:py-14">
      <OpenedBeacon token={token} />
      <div className="mx-auto flex max-w-2xl flex-col gap-8 md:gap-10">
        <header className="rounded-t-arch rounded-b-card border border-line bg-surface px-6 pt-12 pb-10 text-center shadow-card md:px-12 md:pt-16">
          <p className="text-label-sm font-semibold tracking-widest text-secondary-ink uppercase">
            ✦ {t('eyebrow')} ✦
          </p>
          <p className="mt-4 font-display text-title text-secondary-ink italic">
            {t('dear', { name: guest.name })}
          </p>
          <h1 className="mt-2 font-display text-headline-lg-sm [overflow-wrap:anywhere] text-ink md:text-display-sm">
            {first} <span className="text-secondary-ink italic">&amp;</span> {second}
          </h1>
          <div aria-hidden className="mx-auto mt-5 h-px w-12 bg-secondary" />
          <p className="mt-5 text-body-lg text-ink-muted">{t('lead')}</p>
          {wedding.welcomeMessage && (
            <p className="mx-auto mt-6 max-w-lg rounded-card bg-canvas-muted px-5 py-4 text-body whitespace-pre-line text-ink-muted">
              {wedding.welcomeMessage}
            </p>
          )}
        </header>

        <section aria-labelledby="events-title" className="flex flex-col gap-4">
          <div className="flex items-end justify-between gap-3">
            <h2 id="events-title" className="font-display text-headline-sm text-ink">
              {t('eventsTitle')}
            </h2>
            {events.length > 0 && (
              <p className="rounded-full bg-canvas-muted px-3 py-1 text-label text-ink-muted">
                {t('eventsCount', { count: events.length })}
              </p>
            )}
          </div>
          {events.length === 0 ? (
            <p className="rounded-card border border-line bg-surface p-6 text-body text-ink-muted">
              {t('noEvents')}
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {events.map((event, index) => {
                const venue = [event.venue?.name, event.venue?.address].filter(Boolean).join(', ');
                return (
                  <li
                    key={index}
                    className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <h3 className="flex items-center gap-2 font-display text-title text-ink">
                        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-secondary" />
                        {event.name}
                      </h3>
                      <p className="text-body text-ink">
                        {formatCalendarDate(event.date, 'full')} ·{' '}
                        {formatTimeRange(event.startTime, event.endTime) ?? t('timeTba')}
                      </p>
                      <p className="flex items-start gap-1.5 text-body-sm text-ink-muted">
                        <MapPinIcon width={16} height={16} className="mt-0.5 shrink-0" />
                        <span className="[overflow-wrap:anywhere]">{venue || t('venueTba')}</span>
                      </p>
                      {event.dressCode && (
                        <p className="text-body-sm text-ink-muted">
                          {t('dressCode', { dressCode: event.dressCode })}
                        </p>
                      )}
                    </div>
                    {event.venue?.mapUrl && (
                      <a
                        href={event.venue.mapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 self-start text-body-sm font-semibold text-secondary-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-focus sm:self-center"
                      >
                        {t('openInMaps')}
                        <ExternalLinkIcon width={14} height={14} />
                      </a>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {events.length > 0 && (
          <RsvpForm
            token={token}
            maxPeople={guest.maxPeople}
            initialRsvp={invitation.rsvp}
            rsvpLocked={invitation.rsvpLocked}
            {...(invitation.rsvpDeadline
              ? { deadline: formatCalendarDate(invitation.rsvpDeadline) }
              : {})}
          />
        )}
      </div>
    </main>
  );
}
