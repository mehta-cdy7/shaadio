import { getTranslations } from 'next-intl/server';
import { ArchCard, ArchCardHeader } from '@/components/ui/card';
import { CalendarIcon, CheckCircleIcon, ClockIcon } from '@/components/ui/icons';
import { MockFigure } from './parts';

const EVENTS = ['sangeet', 'wedding', 'reception'] as const;

/** Hero: the invitation a guest opens from their family's link (PRD §9.10). */
export async function InvitationMock() {
  const t = await getTranslations('landing.hero.mock');

  return (
    <MockFigure label={t('label')} className="relative isolate w-full max-w-sm">
      <div
        aria-hidden="true"
        className="absolute -inset-4 -z-10 rounded-[3.75rem] bg-primary-soft/40 blur-2xl"
      />
      <p className="absolute -top-3.5 -right-2 z-10 flex items-center gap-2 rounded-full bg-surface/95 px-4 py-2 text-label font-medium text-ink shadow-float backdrop-blur-md">
        <CheckCircleIcon className="size-4 text-success" />
        {t('attending')}
      </p>
      <p className="absolute -bottom-3 -left-3 z-10 flex items-center gap-2 rounded-full bg-primary-soft px-4 py-2 text-label font-medium text-on-primary-soft shadow-float">
        <CalendarIcon className="size-4" />
        {t('countdown')}
      </p>

      <ArchCard>
        <div className="mx-auto mb-5 h-1 w-12 rounded-full bg-secondary opacity-60" />
        <ArchCardHeader className="text-center">
          <p className="mb-1 font-display text-headline-sm tracking-widest text-secondary-ink uppercase">
            {t('monogram')}
          </p>
          <p className="font-display text-headline-md font-medium text-ink-accent">{t('couple')}</p>
          <p className="mt-0.5 text-body-sm text-ink-muted">{t('dateVenue')}</p>
        </ArchCardHeader>

        <ul className="mb-6 flex flex-col gap-3">
          {EVENTS.map((key) => (
            <li key={key} className="rounded-xl bg-canvas-muted p-3.5 shadow-card">
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="text-body font-semibold text-ink-accent">
                  {t(`events.${key}.name`)}
                </span>
                <span className="rounded-sm bg-surface px-2 py-0.5 text-label-sm font-medium text-secondary-ink">
                  {t(`events.${key}.date`)}
                </span>
              </div>
              <p className="flex items-center gap-1.5 text-body-sm text-ink-muted">
                <ClockIcon className="size-4 shrink-0 text-secondary-ink" />
                {t(`events.${key}.detail`)}
              </p>
            </li>
          ))}
        </ul>

        <span className="flex h-12 w-full items-center justify-center rounded-control bg-primary text-title font-semibold text-on-primary shadow-card">
          {t('rsvp')}
        </span>
        <p className="mt-2.5 text-center text-label-sm text-ink-muted">{t('noLogin')}</p>
      </ArchCard>
    </MockFigure>
  );
}
