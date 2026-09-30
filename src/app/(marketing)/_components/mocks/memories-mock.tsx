import { getTranslations } from 'next-intl/server';
import { ArchCard, ArchCardHeader } from '@/components/ui/card';
import { ImageIcon, PlayIcon, QrIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { MockFigure } from './parts';

const FEATURES = [
  { key: 'livestream', Icon: PlayIcon },
  { key: 'qr', Icon: QrIcon },
] as const;

// Albums group photos by event (PRD §9.21).
const ALBUMS = ['haldi', 'sangeet', 'wedding'] as const;

/** Chapter 04: YouTube livestream (§9.24), gallery QR code (§9.23) and event albums. */
export async function MemoriesMock() {
  const t = await getTranslations('landing');

  return (
    <MockFigure label={t('chapters.memories.mock.label')} className="w-full max-w-lg">
      <ArchCard>
        <ArchCardHeader className="text-center">
          <p className="text-label-sm font-medium tracking-widest text-secondary-ink uppercase">
            {t('chapters.memories.mock.eyebrow')}
          </p>
          <p className="font-display text-headline-sm text-ink-accent">
            {t('chapters.memories.mock.title')}
          </p>
        </ArchCardHeader>

        <ul className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {FEATURES.map(({ key, Icon }) => (
            <li key={key} className="flex items-center gap-3 rounded-xl bg-canvas-muted p-3">
              <Icon className="size-5.5 shrink-0 text-secondary-ink" />
              <div className="min-w-0">
                <p className="text-body font-semibold text-ink-accent">
                  {t(`chapters.memories.mock.${key}.title`)}
                </p>
                <p className="text-label-sm text-ink-muted">
                  {t(`chapters.memories.mock.${key}.detail`)}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <ul className="grid grid-cols-3 gap-3">
          {ALBUMS.map((key, i) => (
            <li
              key={key}
              className={cn(
                'flex h-28 flex-col items-center justify-center gap-1 rounded-xl p-3 text-center',
                i === 1 ? 'bg-fill' : 'bg-canvas-muted',
              )}
            >
              <ImageIcon className="size-6 text-secondary-ink/70" />
              <p className="text-label font-semibold text-ink-accent">{t(`ceremonies.${key}`)}</p>
              <p className="text-label-sm text-ink-muted">
                {t(`chapters.memories.mock.albums.${key}`)}
              </p>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-center text-label-sm text-ink-muted">
          {t('chapters.memories.mock.footnote')}
        </p>
      </ArchCard>
    </MockFigure>
  );
}
