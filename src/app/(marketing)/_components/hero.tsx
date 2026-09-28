import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { ArrowRightIcon } from '@/components/ui/icons';
import { Heading, Lead } from '@/components/ui/typography';

export const CEREMONIES = ['roka', 'mehendi', 'haldi', 'sangeet', 'wedding', 'reception'] as const;

export async function Hero() {
  const t = await getTranslations('landing');

  return (
    <section className="relative overflow-hidden bg-lattice">
      <Container className="grid items-center gap-12 py-14 md:py-20 lg:grid-cols-12 lg:gap-8">
        <div className="flex flex-col items-start gap-6 lg:col-span-7">
          <Badge tone="accent">{t('hero.badge')}</Badge>
          <Heading as="h1" size="display" className="max-w-2xl">
            {t('hero.title')}
          </Heading>
          <Lead className="max-w-xl">{t('hero.body')}</Lead>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/signup" size="lg">
              {t('hero.primaryCta')}
              <ArrowRightIcon />
            </ButtonLink>
            <ButtonLink href="#how-it-works" size="lg" variant="outline">
              {t('hero.secondaryCta')}
            </ButtonLink>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="text-body-sm text-ink-muted">{t('hero.ceremoniesLabel')}</span>
            {CEREMONIES.map((key) => (
              <Badge key={key}>{t(`ceremonies.${key}`)}</Badge>
            ))}
          </div>
        </div>
        <div className="flex justify-center lg:col-span-5 lg:justify-end">
          <Image
            src="/images/landing/hero.webp"
            alt={t('hero.imageAlt')}
            width={1034}
            height={1384}
            priority
            sizes="(min-width: 1024px) 420px, 80vw"
            className="h-auto w-full max-w-[420px]"
          />
        </div>
      </Container>
    </section>
  );
}
