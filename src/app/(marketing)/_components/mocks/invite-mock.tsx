import { getTranslations } from 'next-intl/server';
import { ArchCard, ArchCardHeader } from '@/components/ui/card';
import { CopyIcon } from '@/components/ui/icons';
import { MockFigure, RsvpBadge } from './parts';

const ROWS = [
  { key: 'kapoor', status: 'attending' },
  { key: 'sharma', status: 'attending' },
  { key: 'mehta', status: 'pending' },
] as const;

/** Chapter 02: one private link per family (PRD §9.9), each with its own events and RSVP. */
export async function InviteMock() {
  const t = await getTranslations('landing');

  return (
    <MockFigure label={t('chapters.invite.mock.label')} className="w-full max-w-lg">
      <ArchCard>
        <ArchCardHeader className="text-center">
          <p className="text-label-sm font-medium tracking-widest text-secondary-ink uppercase">
            {t('chapters.invite.mock.eyebrow')}
          </p>
          <p className="font-display text-headline-sm text-ink-accent">
            {t('chapters.invite.mock.title')}
          </p>
        </ArchCardHeader>

        <div className="mb-6 rounded-xl bg-canvas-muted p-4 shadow-card">
          <p className="mb-1 text-label-sm text-ink-muted">{t('chapters.invite.mock.linkLabel')}</p>
          <p className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3.5 py-2.5">
            <span className="truncate text-body-sm font-medium text-ink-accent">
              {t('chapters.invite.mock.link')}
            </span>
            <CopyIcon className="size-4.5 shrink-0 text-secondary-ink" />
          </p>
        </div>

        <ul className="flex flex-col gap-3">
          {ROWS.map(({ key, status }) => (
            <li
              key={key}
              className="flex items-center justify-between gap-3 rounded-lg bg-canvas-muted p-3.5"
            >
              <div className="min-w-0">
                <p className="text-body font-semibold text-ink">
                  {t(`chapters.invite.mock.rows.${key}.name`)}
                </p>
                <p className="text-body-sm text-ink-muted">
                  {t(`chapters.invite.mock.rows.${key}.detail`)}
                </p>
              </div>
              <RsvpBadge status={status}>{t(`status.${status}`)}</RsvpBadge>
            </li>
          ))}
        </ul>
      </ArchCard>
    </MockFigure>
  );
}
