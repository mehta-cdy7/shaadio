import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { HistoryIcon, UsersIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { CEREMONIES } from '@/lib/ceremonies';
import { MockFigure, ProgressBar, RsvpBadge, type RsvpStatus } from './parts';

// Only actions the activity log records (PRD §9.26).
const ACTIVITY = [
  { key: 'papa', avatar: 'bg-pending text-on-pending' },
  { key: 'masi', avatar: 'bg-primary-soft text-on-primary-soft' },
  { key: 'priyanka', avatar: 'bg-fill text-ink-accent' },
  { key: 'nik', avatar: 'bg-success-subtle text-success' },
] as const;

const GUESTS = [
  { key: 'kapoor', status: 'attending' },
  { key: 'sharma', status: 'attending' },
  { key: 'verma', status: 'pending' },
  { key: 'mehta', status: 'notAttending' },
] as const satisfies ReadonlyArray<{ key: string; status: RsvpStatus }>;

/** Workspace preview: dashboard summary cards (PRD §9.3), recent activity and Sangeet RSVPs. */
export async function WorkspaceMock() {
  const t = await getTranslations('landing');

  return (
    <MockFigure
      label={t('workspace.mock.label')}
      className="w-full overflow-hidden rounded-card bg-surface text-left shadow-float"
    >
      <div className="flex items-center justify-between gap-4 bg-fill px-5 py-3.5">
        <div className="flex shrink-0 items-center gap-2">
          <span className="size-2.5 rounded-full bg-ink-muted/30" />
          <span className="size-2.5 rounded-full bg-ink-muted/30" />
          <span className="size-2.5 rounded-full bg-ink-muted/30" />
          <span className="ml-4 hidden text-label-sm text-ink-muted sm:inline">
            {t('workspace.mock.url')}
          </span>
        </div>
        <p className="flex min-w-0 items-center gap-1.5 text-label font-medium text-ink-accent">
          <span className="size-2 shrink-0 rounded-full bg-secondary" />
          <span className="truncate">{t('workspace.mock.title')}</span>
        </p>
        <span className="hidden w-16 md:block" />
      </div>

      <div className="flex gap-2 overflow-hidden [mask-image:linear-gradient(to_right,black_80%,transparent)] px-6 pt-5 pb-2 lg:[mask-image:none]">
        <span className="shrink-0 rounded-lg bg-primary px-4 py-2 text-label font-medium text-on-primary shadow-card">
          {t('workspace.mock.allEvents')}
        </span>
        {CEREMONIES.map((key) => (
          <span key={key} className="shrink-0 rounded-lg px-4 py-2 text-label text-ink-muted">
            {t(`ceremonies.${key}`)}
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-6 p-6 md:p-8">
        <ul className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <Metric
            label={t('workspace.mock.invitations.label')}
            aside={<span className="size-2 rounded-full bg-secondary" />}
            value={t('workspace.mock.invitations.value')}
            detail={t('workspace.mock.invitations.detail')}
          />
          <Metric
            label={t('workspace.mock.rsvps.label')}
            aside={
              <span className="text-label-sm font-semibold text-ink-accent">
                {t('workspace.mock.rsvps.aside')}
              </span>
            }
            value={t('workspace.mock.rsvps.value')}
            detail={t('workspace.mock.rsvps.detail')}
          >
            <ProgressBar value={80} className="mt-3" />
          </Metric>
          <Metric
            label={t('workspace.mock.expenses.label')}
            value={t('workspace.mock.expenses.value')}
            detail={t('workspace.mock.expenses.detail')}
          />
        </ul>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <Panel
            className="lg:col-span-7"
            icon={<HistoryIcon />}
            title={t('workspace.mock.activity.title')}
            note={t('workspace.mock.activity.note')}
          >
            <ul className="flex flex-col gap-3">
              {ACTIVITY.map(({ key, avatar }) => (
                <li key={key} className="flex items-start gap-3.5 rounded-lg bg-surface p-3">
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-full text-label font-semibold',
                      avatar,
                    )}
                  >
                    {t(`workspace.mock.activity.items.${key}.initials`)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-body text-ink">
                      <strong className="font-semibold text-ink-accent">
                        {t(`workspace.mock.activity.items.${key}.who`)}
                      </strong>{' '}
                      {t(`workspace.mock.activity.items.${key}.what`)}
                    </p>
                    <p className="text-body-sm text-ink-muted">
                      {t(`workspace.mock.activity.items.${key}.meta`)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            className="lg:col-span-5"
            icon={<UsersIcon />}
            title={t('workspace.mock.guests.title')}
            note={t('workspace.mock.guests.note')}
          >
            <ul className="flex flex-col gap-3">
              {GUESTS.map(({ key, status }) => (
                <li
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-lg bg-surface p-3.5"
                >
                  <div className="min-w-0">
                    <p className="text-body font-semibold text-ink">
                      {t(`workspace.mock.guests.rows.${key}.name`)}
                    </p>
                    <p className="text-body-sm text-ink-muted">
                      {t(`workspace.mock.guests.rows.${key}.detail`)}
                    </p>
                  </div>
                  <RsvpBadge status={status}>{t(`status.${status}`)}</RsvpBadge>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </MockFigure>
  );
}

function Metric({
  label,
  aside,
  value,
  detail,
  children,
}: {
  label: string;
  aside?: ReactNode;
  value: string;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <li className="rounded-xl bg-canvas-muted p-5 shadow-card">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-label-sm tracking-wider text-ink-muted uppercase">{label}</span>
        {aside}
      </div>
      <p className="font-display text-headline-md font-medium text-ink-accent tabular-nums">
        {value}
      </p>
      <p className="mt-1.5 text-body-sm text-ink-muted">{detail}</p>
      {children}
    </li>
  );
}

function Panel({
  icon,
  title,
  note,
  className,
  children,
}: {
  icon: ReactNode;
  title: string;
  note: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('rounded-xl bg-canvas-muted p-5 shadow-card', className)}>
      <div className="-mx-5 -mt-5 mb-4 flex items-center justify-between gap-3 rounded-t-xl bg-fill/60 px-5 py-3.5">
        <p className="flex items-center gap-2 text-title font-semibold text-ink-accent">
          <span className="text-secondary-ink">{icon}</span>
          {title}
        </p>
        <span className="shrink-0 text-label-sm text-ink-muted">{note}</span>
      </div>
      {children}
    </div>
  );
}
