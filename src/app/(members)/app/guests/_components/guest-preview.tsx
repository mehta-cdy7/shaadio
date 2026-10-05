'use client';

import { useTranslations } from 'next-intl';
import { UsersIcon } from '@/components/ui/icons';
import { Eyebrow } from '@/components/ui/typography';
import { cn } from '@/lib/cn';
import { formatCalendarDate, formatWallTime } from '@/lib/dates';
import type { EventOption } from './event-option';

/** How the guest's invitation will list their events (Stitch "Add Guest" preview). */
export function GuestPreview({
  couple,
  name,
  maxPeople,
  events,
}: {
  couple: string;
  name: string;
  maxPeople: number;
  /** The chosen events, in date order. */
  events: EventOption[];
}) {
  const t = useTranslations('members.guests.preview');
  const guestName = name.trim();

  return (
    <section aria-label={t('label')} className="flex w-full flex-col items-center gap-5">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-label-sm font-semibold tracking-widest text-secondary-ink uppercase">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-secondary" />
        {t('label')}
      </span>
      <div className="w-full rounded-card border border-line bg-surface px-6 py-8 text-center shadow-float">
        <Eyebrow>{t('eyebrow')}</Eyebrow>
        <p className="mt-1 font-display text-headline-sm text-ink">{couple}</p>
        <span aria-hidden="true" className="mx-auto my-5 block h-px w-12 bg-secondary/60" />
        <p className="text-label-sm font-semibold tracking-widest text-ink-muted uppercase">
          {t('invited')}
        </p>
        <p
          className={cn(
            'mt-2 font-display text-headline-md break-words',
            guestName ? 'text-ink' : 'text-ink-muted/60',
          )}
        >
          {guestName || t('namePlaceholder')}
        </p>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-pending px-3 py-1 text-label font-semibold text-on-pending">
          <UsersIcon width={14} height={14} />
          {t('party', { count: maxPeople })}
        </p>
        <p className="mt-5 font-display text-body-lg text-ink-muted italic">{t('intro')}</p>
        {events.length ? (
          <ul className="mt-4 flex flex-col gap-2 rounded-control bg-canvas-muted p-4 text-left">
            {events.map((event) => (
              <li key={event.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 font-display text-body-lg text-ink">{event.name}</span>
                <span className="shrink-0 text-label text-ink-muted">
                  {formatCalendarDate(event.date, 'dayMonth')}
                  {event.startTime && ` · ${formatWallTime(event.startTime)}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-control bg-canvas-muted p-4 text-body text-ink-muted">
            {t('noEvents')}
          </p>
        )}
      </div>
      <p className="text-center text-body text-ink-muted italic">{t('caption')}</p>
    </section>
  );
}
