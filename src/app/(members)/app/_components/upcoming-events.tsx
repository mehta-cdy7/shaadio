import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, MapPinIcon, UsersIcon } from '@/components/ui/icons';
import { calendarDateParts, formatWallTime } from '@/lib/dates';
import { cn } from '@/lib/cn';
import type { DashboardEvent } from '@/modules/dashboard/schemas';
import { EmptyState, Panel } from './panel';

/** The next three events (PRD §9.3 "Upcoming Events"); the nearest one is highlighted. */
export async function UpcomingEvents({ events }: { events: DashboardEvent[] }) {
  const t = await getTranslations('members.dashboard.upcomingEvents');

  if (events.length === 0) {
    return (
      <Panel title={t('title')}>
        <EmptyState
          icon={CalendarIcon}
          title={t('emptyTitle')}
          body={t('emptyBody')}
          cta={{ href: '/app/events/new', label: t('emptyCta') }}
        />
      </Panel>
    );
  }

  return (
    <Panel title={t('title')} viewAll={{ href: '/app/events', label: t('viewAll') }}>
      <ul className="flex flex-col gap-3">
        {events.map((event, index) => {
          const { day, month } = calendarDateParts(event.date);
          return (
            <li key={event.id} className="flex gap-4 rounded-control bg-canvas-muted p-4">
              <span
                className={cn(
                  'flex size-14 shrink-0 flex-col items-center justify-center rounded-control',
                  index === 0 ? 'bg-pending text-on-pending' : 'bg-fill text-ink',
                )}
              >
                <span className="text-label-sm font-semibold tracking-widest uppercase">
                  {month}
                </span>
                <span className="font-display text-headline-sm">{day}</span>
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-title font-medium text-ink">{event.name}</h3>
                  {event.startTime && (
                    <Badge tone={index === 0 ? 'pending' : 'neutral'} size="sm">
                      {formatWallTime(event.startTime)}
                    </Badge>
                  )}
                </div>
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-ink-muted">
                  {event.venue?.name && (
                    <span className="flex items-center gap-1">
                      <MapPinIcon width={14} height={14} className="shrink-0" />
                      {event.venue.name}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <UsersIcon width={14} height={14} className="shrink-0" />
                    {t('confirmed', { people: event.headcount.people })}
                  </span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
