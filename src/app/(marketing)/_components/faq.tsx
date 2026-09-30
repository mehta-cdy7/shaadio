import { getTranslations } from 'next-intl/server';
import { Container } from '@/components/ui/container';
import { ChevronDownIcon } from '@/components/ui/icons';
import { Section } from '@/components/ui/section';
import { SectionIntro } from './section-intro';

const ITEMS = ['free', 'download', 'parents', 'guestList', 'photos'] as const;

/** Native <details>: accessible and needs no client JavaScript. The first answer starts open. */
export async function Faq() {
  const t = await getTranslations('landing.faq');

  return (
    <Section id="faq" className="scroll-mt-20">
      <Container>
        <div className="mx-auto flex max-w-3xl flex-col gap-12">
          <SectionIntro eyebrow={t('eyebrow')} title={t('title')} />
          <div className="flex flex-col gap-4">
            {ITEMS.map((key, i) => (
              <details
                key={key}
                open={i === 0}
                className="group rounded-xl border border-line bg-canvas-muted p-5 shadow-card"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-title font-semibold text-ink-accent [&::-webkit-details-marker]:hidden">
                  {t(`items.${key}.q`)}
                  <ChevronDownIcon className="shrink-0 text-secondary-ink transition-transform group-open:rotate-180" />
                </summary>
                <p className="pt-3.5 text-body text-ink-muted">{t(`items.${key}.a`)}</p>
              </details>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  );
}
