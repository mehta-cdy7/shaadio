import { getTranslations } from 'next-intl/server';
import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';
import { SectionIntro } from './section-intro';

const STEPS = ['one', 'two', 'three'] as const;

export async function HowItWorks() {
  const t = await getTranslations('landing.howItWorks');

  return (
    <Section id="how-it-works" className="scroll-mt-20">
      <Container className="flex flex-col gap-14 md:gap-16">
        <SectionIntro
          eyebrow={t('eyebrow')}
          title={t('title')}
          body={t('body')}
          className="max-w-2xl"
        />
        <ol className="grid grid-cols-1 gap-10 md:grid-cols-3">
          {STEPS.map((key, i) => (
            <li key={key} className="flex flex-col items-start gap-4">
              {/* The list already numbers the steps for screen readers. */}
              <span aria-hidden="true" className="font-display text-display text-secondary-ink">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span aria-hidden="true" className="mb-2 h-0.5 w-12 bg-secondary/60" />
              <h3 className="font-display text-headline-sm font-medium text-ink-accent">
                {t(`steps.${key}.title`)}
              </h3>
              <p className="text-body text-ink-muted">{t(`steps.${key}.body`)}</p>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}
