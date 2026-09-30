import { getTranslations } from 'next-intl/server';
import { ArchCard, ArchCardHeader } from '@/components/ui/card';
import { MockFigure } from './parts';

// Per-event headcounts are derived from each family's single RSVP (PRD §9.11).
const HEADCOUNTS = ['roka', 'sangeet', 'wedding', 'reception'] as const;
const EXPENSES = ['venue', 'catering', 'decor'] as const;

/** Chapter 03: headcount per ceremony and recorded expenses with who paid (PRD §9.15). */
export async function NumbersMock() {
  const t = await getTranslations('landing');

  return (
    <MockFigure label={t('chapters.numbers.mock.label')} className="w-full max-w-lg">
      <ArchCard>
        <ArchCardHeader>
          <p className="text-label-sm tracking-wider text-ink-muted uppercase">
            {t('chapters.numbers.mock.totalLabel')}
          </p>
          <p className="font-display text-headline-sm text-ink-accent tabular-nums">
            {t('chapters.numbers.mock.total')}
          </p>
        </ArchCardHeader>

        <p className="mb-2 text-label-sm tracking-wider text-ink-muted uppercase">
          {t('chapters.numbers.mock.headcountLabel')}
        </p>
        <ul className="mb-6 grid grid-cols-4 gap-2 text-center">
          {HEADCOUNTS.map((key) => (
            <li key={key} className="rounded-xl bg-canvas-muted px-1 py-2.5">
              <p className="font-display text-headline-sm text-ink-accent tabular-nums">
                {t(`chapters.numbers.mock.headcounts.${key}`)}
              </p>
              <p className="mt-0.5 truncate text-label-sm text-ink-muted">
                {t(`ceremonies.${key}`)}
              </p>
            </li>
          ))}
        </ul>

        <ul className="flex flex-col gap-3">
          {EXPENSES.map((key) => (
            <li
              key={key}
              className="flex items-center justify-between gap-3 rounded-lg bg-canvas-muted p-3.5"
            >
              <div className="min-w-0">
                <p className="text-body font-semibold text-ink">
                  {t(`chapters.numbers.mock.expenses.${key}.name`)}
                </p>
                <p className="text-body-sm text-ink-muted">
                  {t(`chapters.numbers.mock.expenses.${key}.detail`)}
                </p>
              </div>
              <span className="shrink-0 text-body font-semibold text-ink-accent tabular-nums">
                {t(`chapters.numbers.mock.expenses.${key}.amount`)}
              </span>
            </li>
          ))}
        </ul>
      </ArchCard>
    </MockFigure>
  );
}
