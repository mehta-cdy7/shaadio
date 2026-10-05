import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { ClockIcon, MapPinIcon, UsersIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { calendarDateParts, formatTimeRange } from '@/lib/dates';
import type { EventResponse } from '@/modules/events/schemas';
import { EventActions } from './event-actions';

/** One event in the list (Stitch "Events List"). */
export async function EventCard({
  event,
  isNext,
  isWeddingDay,
  isPast,
}: {
  event: EventResponse;
  isNext: boolean;
  isWeddingDay: boolean;
  isPast: boolean;
}) {
  const t = await getTranslations('members.events');
  const { day, month } = calendarDateParts(event.date);
  const year = event.date.slice(0, 4);
  const time = formatTimeRange(event.startTime, event.endTime);
  const typeLabel = t(`types.${event.type}`);

  return (
    <li
      className={cn(
        'flex gap-4 rounded-card border bg-surface p-4 shadow-card sm:gap-5 sm:p-6',
        isNext ? 'border-secondary' : 'border-line',
      )}
    >
      <div
        className={cn(
          'flex size-16 shrink-0 flex-col items-center justify-center rounded-control',
          isNext ? 'bg-pending text-on-pending' : 'bg-fill text-ink',
          isPast && 'opacity-60',
        )}
      >
        <span className="text-label-sm font-semibold tracking-widest uppercase">{month}</span>
        <span className="font-display text-headline-sm leading-none">{day}</span>
        <span className="text-label-sm text-ink-muted">{year}</span>
      </div>

      <div className={cn('flex min-w-0 flex-1 flex-col gap-1.5', isPast && 'opacity-70')}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-headline-sm text-ink">{event.name}</h3>
          {event.name !== typeLabel && (
            <Badge size="sm" tone="neutral">
              {typeLabel}
            </Badge>
          )}
          {isWeddingDay && (
            <Badge size="sm" tone="pending" dot>
              {t('list.weddingDay')}
            </Badge>
          )}
          {isNext && (
            <Badge size="sm" tone="soft" dot>
              {t('list.next')}
            </Badge>
          )}
          {isPast && (
            <Badge size="sm" tone="neutral">
              {t('list.done')}
            </Badge>
          )}
        </div>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-body text-ink-muted">
          <span className="flex items-center gap-1.5">
            <ClockIcon width={16} height={16} className="shrink-0" />
            {time ?? t('list.timeTba')}
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPinIcon width={16} height={16} className="shrink-0" />
            <span className="truncate">{event.venue?.name ?? t('list.venueTba')}</span>
          </span>
        </p>
        {event.dressCode && (
          <p className="text-body text-ink-muted">
            {t('list.dressCode', { dressCode: event.dressCode })}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-3 sm:flex-row sm:items-start">
        <span className="hidden items-center gap-1.5 rounded-control bg-fill px-3 py-1.5 text-body-sm text-ink sm:flex">
          <UsersIcon width={16} height={16} />
          {t('list.confirmed', { people: event.headcount.people })}
        </span>
        <EventActions id={event.id} name={event.name} />
      </div>
    </li>
  );
}
