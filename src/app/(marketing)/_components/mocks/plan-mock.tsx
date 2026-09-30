import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { ArchCard, ArchCardHeader } from '@/components/ui/card';
import { CheckSquareIcon, SquareIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { MockFigure, ProgressBar } from './parts';

// Task views from PRD §9.6.
const TABS = ['all', 'mine', 'completed'] as const;

const TASKS = [
  { key: 'sound', done: true },
  { key: 'sweets', done: true },
  { key: 'mehendi', done: false },
] as const;

/** Chapter 01: wedding countdown and family tasks. */
export async function PlanMock() {
  const t = await getTranslations('landing.chapters.plan.mock');

  return (
    <MockFigure label={t('label')} className="w-full max-w-lg">
      <ArchCard>
        <ArchCardHeader className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-display text-headline-sm text-ink-accent">{t('title')}</p>
          <Badge tone="pending">{t('countdown')}</Badge>
        </ArchCardHeader>

        <div className="mb-6 flex rounded-xl bg-canvas-muted p-1.5">
          {TABS.map((key, i) => (
            <span
              key={key}
              className={cn(
                'flex-1 rounded-lg py-2 text-center text-label',
                i === 0 ? 'bg-surface font-semibold text-ink-accent shadow-card' : 'text-ink-muted',
              )}
            >
              {t(`tabs.${key}`)}
            </span>
          ))}
        </div>

        <div className="mb-1.5 flex items-center justify-between gap-3 text-label-sm text-ink-muted">
          <span>{t('progressLabel')}</span>
          <span className="font-semibold text-ink-accent">{t('progress')}</span>
        </div>
        <ProgressBar value={75} className="mb-4" />

        <ul className="flex flex-col gap-3">
          {TASKS.map(({ key, done }) => (
            <li
              key={key}
              className="flex items-center justify-between gap-3 rounded-lg bg-canvas-muted p-3"
            >
              <span className="flex min-w-0 items-center gap-3">
                {done ? (
                  <CheckSquareIcon className="shrink-0 text-secondary-ink" />
                ) : (
                  <SquareIcon className="shrink-0 text-ink-accent" />
                )}
                <span
                  className={
                    done
                      ? 'text-body text-ink-muted line-through'
                      : 'text-body font-medium text-ink-accent'
                  }
                >
                  {t(`tasks.${key}.title`)}
                </span>
              </span>
              <span
                className={
                  done
                    ? 'shrink-0 text-label-sm text-ink-muted'
                    : 'shrink-0 rounded-sm bg-surface px-2 py-0.5 text-label-sm font-medium text-secondary-ink'
                }
              >
                {t(`tasks.${key}.assignee`)}
              </span>
            </li>
          ))}
        </ul>
      </ArchCard>
    </MockFigure>
  );
}
