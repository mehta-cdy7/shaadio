import { getTranslations } from 'next-intl/server';
import { Container } from '@/components/ui/container';
import { CheckIcon } from '@/components/ui/icons';
import { Section } from '@/components/ui/section';
import { Eyebrow, Heading, Lead } from '@/components/ui/typography';

const ITEMS = ['links', 'unlisted', 'gallery', 'delete'] as const;

export async function Privacy() {
  const t = await getTranslations('landing.privacy');

  return (
    <Section id="privacy" className="scroll-mt-20">
      <Container className="flex flex-col gap-12">
        <div className="flex flex-col items-center gap-4 text-center">
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <Heading>{t('title')}</Heading>
          <Lead className="max-w-xl">{t('body')}</Lead>
        </div>
        <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map((key) => (
            <li key={key} className="flex flex-col gap-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary text-on-primary">
                <CheckIcon />
              </span>
              <h3 className="text-title font-semibold">{t(`items.${key}.title`)}</h3>
              <p className="text-body text-ink-muted">{t(`items.${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
