import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/button';
import { CalendarIcon, PlusIcon } from '@/components/ui/icons';
import { currentMember } from '@/app/_lib/current-member';
import { formatCalendarDate, todayIn } from '@/lib/dates';
import { listEvents } from '@/modules/events';
import { EVENTS_PER_WEDDING } from '@/modules/events/schemas';
import { EmptyState } from '../_components/panel';
import { EventCard } from './_components/event-card';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('members.events');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/** Events (PRD §9.5): every ceremony in date order, from the same service as GET /api/events. */
export default async function EventsPage() {
  const current = await currentMember();
  if (!current?.member) redirect('/onboarding');
  const { wedding } = current.member;
  const t = await getTranslations('members.events');

  const events = await listEvents({ weddingId: current.member.weddingId });
  const today = todayIn(wedding.timezone);
  const nextId = events.find((event) => event.date >= today)?.id;
  const full = events.length >= EVENTS_PER_WEDDING;

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-headline-lg-sm text-ink md:text-headline-lg">
            {t('title')}
          </h1>
          <p className="mt-1 text-body-lg text-ink-muted">
            {t('summary', {
              count: events.length,
              date: formatCalendarDate(wedding.weddingDate),
            })}
          </p>
        </div>
        {!full && (
          <ButtonLink href="/app/events/new" className="self-start sm:self-auto">
            <PlusIcon width={18} height={18} />
            {t('add')}
          </ButtonLink>
        )}
      </header>

      {events.length === 0 ? (
        <div className="rounded-card border border-line bg-surface p-6 shadow-card">
          <EmptyState
            icon={CalendarIcon}
            title={t('empty.title')}
            body={t('empty.body')}
            cta={{ href: '/app/events/new', label: t('add') }}
          />
        </div>
      ) : (
        <ul aria-label={t('list.label')} className="flex flex-col gap-4">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              isNext={event.id === nextId}
              isWeddingDay={event.date === wedding.weddingDate}
              isPast={event.date < today}
            />
          ))}
        </ul>
      )}

      <p className="text-body text-ink-muted">
        {full
          ? t('limitReached', { max: EVENTS_PER_WEDDING })
          : t('limitNote', { max: EVENTS_PER_WEDDING })}
      </p>
    </div>
  );
}
