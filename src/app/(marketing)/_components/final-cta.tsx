import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';
import { Heading } from '@/components/ui/typography';

export async function FinalCta() {
  const t = await getTranslations('landing.finalCta');

  return (
    <Section tone="primary">
      <Container className="flex flex-col items-center gap-6 text-center">
        <Heading size="display">{t('title')}</Heading>
        <p className="max-w-xl text-body-lg opacity-80">{t('body')}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <ButtonLink href="/signup" size="lg" variant="inverse">
            {t('primaryCta')}
          </ButtonLink>
          <a
            href="#how-it-works"
            className="inline-flex h-12 items-center px-6 text-body font-semibold underline decoration-on-primary-accent underline-offset-4"
          >
            {t('secondaryCta')}
          </a>
        </div>
      </Container>
    </Section>
  );
}
