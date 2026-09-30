import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { ArrowRightIcon } from '@/components/ui/icons';
import { Section } from '@/components/ui/section';
import { Heading } from '@/components/ui/typography';

export async function FinalCta() {
  const t = await getTranslations('landing.finalCta');

  return (
    <Section id="get-started" tone="band" className="relative overflow-hidden">
      {/* Two nested jharokha arches, barely visible behind the text. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-5"
      >
        <svg viewBox="0 0 100 100" width={800} height={800} fill="none" stroke="currentColor">
          <path d="M10 90V40c0-25 80-25 80 0v50Z" strokeWidth={0.5} />
          <path d="M20 90V45c0-20 60-20 60 0v45Z" strokeWidth={0.5} />
        </svg>
      </div>
      <Container className="relative flex flex-col items-center gap-6 py-4 text-center">
        <span aria-hidden="true" className="h-1 w-12 rounded-full bg-secondary opacity-80" />
        <Heading size="display" className="tracking-tight">
          {t('title')}
        </Heading>
        <p className="max-w-xl text-body-lg text-on-band-muted">{t('body')}</p>
        <ButtonLink href="/signup" size="lg" variant="inverse" className="mt-2">
          {t('primaryCta')}
          <ArrowRightIcon className="size-4.5" />
        </ButtonLink>
        <p className="text-label-sm text-on-band-muted">{t('note')}</p>
      </Container>
    </Section>
  );
}
