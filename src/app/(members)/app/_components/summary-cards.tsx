import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/cn';
import { formatPaise } from '@/lib/money';
import type { DashboardResponse } from '@/modules/dashboard/schemas';

function StatCard({
  label,
  value,
  long = false,
  children,
}: {
  label: string;
  value: ReactNode;
  /** Wide values (rupee amounts) step down a size where six cards share a row. */
  long?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
      <h3 className="text-label-sm font-semibold tracking-widest text-ink-muted uppercase">
        {label}
      </h3>
      <p className={cn('font-display text-headline-lg text-ink', long && 'xl:text-headline-md')}>
        {value}
      </p>
      <div className="mt-auto border-t border-line pt-3 text-body-sm text-ink-muted">
        {children}
      </div>
    </li>
  );
}

/** Segmented bar; segments are proportional to their values and labelled by the legend below. */
function Bar({ segments }: { segments: Array<{ value: number; className: string }> }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <div aria-hidden="true" className="flex h-1.5 overflow-hidden rounded-full bg-fill">
      {total > 0 &&
        segments.map((segment, index) => (
          <span
            key={index}
            className={segment.className}
            style={{ width: `${(segment.value / total) * 100}%` }}
          />
        ))}
    </div>
  );
}

/** The six PRD §9.3 summary numbers (days to go has its own hero). */
export async function SummaryCards({ data }: { data: DashboardResponse }) {
  const t = await getTranslations('members.dashboard.cards');
  const { events, tasks, guests, expenses, vendors } = data;
  const percent = tasks.total ? Math.round((tasks.done / tasks.total) * 100) : 0;
  const responded = guests.attending + guests.notAttending;
  const nextEvent = events.upcoming[0];

  return (
    <section aria-label={t('label')}>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label={t('events')} value={events.count}>
          <span className="line-clamp-1">
            {nextEvent ? t('eventsNext', { name: nextEvent.name }) : t('eventsNone')}
          </span>
        </StatCard>

        <StatCard
          label={t('tasks')}
          value={
            <>
              {tasks.done}
              <span className="text-headline-sm text-ink-muted"> / {tasks.total}</span>
            </>
          }
        >
          {tasks.total ? (
            <div className="flex flex-col gap-2">
              <Bar
                segments={[
                  { value: tasks.done, className: 'bg-success' },
                  { value: tasks.total - tasks.done, className: 'bg-fill' },
                ]}
              />
              {t('tasksProgress', { percent })}
            </div>
          ) : (
            t('tasksNone')
          )}
        </StatCard>

        <StatCard label={t('invitations')} value={guests.invitations}>
          {t('peopleInvited', { people: guests.peopleInvited })}
        </StatCard>

        <StatCard
          label={t('rsvps')}
          value={
            <>
              {responded}{' '}
              <span className="font-sans text-body text-ink-muted">{t('responded')}</span>
            </>
          }
        >
          <div className="flex flex-col gap-2">
            <Bar
              segments={[
                { value: guests.attending, className: 'bg-success' },
                { value: guests.notAttending, className: 'bg-ink-muted' },
                { value: guests.pending, className: 'bg-pending' },
              ]}
            />
            <ul className="flex flex-col gap-0.5 text-label">
              {(
                [
                  ['attending', guests.attending, 'bg-success'],
                  ['notAttending', guests.notAttending, 'bg-ink-muted'],
                  ['pending', guests.pending, 'bg-pending border border-secondary'],
                ] as const
              ).map(([key, value, dot]) => (
                <li key={key} className="flex items-center gap-1.5">
                  <span aria-hidden="true" className={`size-2 rounded-full ${dot}`} />
                  <span className="font-semibold text-ink">{value}</span>
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>
        </StatCard>

        <StatCard label={t('expenses')} value={formatPaise(expenses.totalPaise)} long>
          {t('expensesNote')}
        </StatCard>

        <StatCard label={t('vendors')} value={vendors.count}>
          {t('vendorsNote', { count: vendors.count })}
        </StatCard>
      </ul>
    </section>
  );
}
