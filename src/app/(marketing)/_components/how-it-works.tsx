import { getTranslations } from 'next-intl/server';
import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';
import { Eyebrow, Heading, Lead } from '@/components/ui/typography';

const STEPS = ['one', 'two', 'three'] as const;

export async function HowItWorks() {
  const t = await getTranslations('landing.howItWorks');

  return (
    <Section id="how-it-works" tone="muted" className="scroll-mt-20">
      <Container className="flex flex-col gap-12">
        <div className="flex flex-col items-center gap-4 text-center">
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <Heading>{t('title')}</Heading>
          <Lead>{t('body')}</Lead>
        </div>
        <ol className="grid gap-8 md:grid-cols-3">
          {STEPS.map((key, i) => (
            <li key={key} className="flex flex-col gap-3 border-t border-secondary pt-6">
              <span className="font-display text-headline-md text-secondary">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="text-title-lg font-semibold">{t(`steps.${key}.title`)}</h3>
              <p className="text-body text-ink-muted">{t(`steps.${key}.body`)}</p>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}
