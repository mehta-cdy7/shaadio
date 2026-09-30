import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { ArrowRightIcon } from '@/components/ui/icons';
import { Heading, Lead } from '@/components/ui/typography';
import { CEREMONIES } from './ceremonies';
import { Lattice } from './lattice';
import { InvitationMock } from './mocks/invitation-mock';

export async function Hero() {
  const t = await getTranslations('landing');

  return (
    <section className="relative overflow-hidden bg-canvas">
      <Lattice />
      <Container className="relative grid grid-cols-1 items-center gap-14 py-16 md:py-24 lg:grid-cols-12">
        <div className="flex flex-col items-start gap-6 lg:col-span-7">
          <p className="inline-flex flex-wrap items-center gap-2 rounded-full bg-canvas-muted px-3.5 py-1 shadow-card">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-secondary-ink" />
            <span className="text-label font-medium tracking-wider text-ink-accent uppercase">
              {t('hero.badge')}
            </span>
            <span aria-hidden="true" className="text-label-sm text-secondary-ink">
              ·
            </span>
            <span className="text-label-sm text-ink-muted">{t('hero.badgeDetail')}</span>
          </p>

          <Heading as="h1" size="display" className="tracking-tight">
            {t.rich('hero.title', {
              em: (chunks) => <em className="text-ink-accent sm:block">{chunks}</em>,
            })}
          </Heading>
          <Lead className="max-w-xl">{t('hero.body')}</Lead>

          <div className="flex w-full flex-col gap-4 pt-2 sm:w-auto sm:flex-row sm:items-center">
            <ButtonLink href="/signup" size="lg">
              {t('hero.primaryCta')}
              <ArrowRightIcon className="size-4.5" />
            </ButtonLink>
            <ButtonLink href="#how-it-works" size="lg" variant="outline">
              {t('hero.secondaryCta')}
            </ButtonLink>
          </div>

          <div className="flex flex-col gap-2 pt-4">
            <p className="text-label-sm tracking-widest text-ink-muted uppercase">
              {t('hero.ceremoniesLabel')}
            </p>
            <ul className="flex flex-wrap gap-2 pt-1">
              {CEREMONIES.map((key) => (
                <li key={key}>
                  <Badge tone="accent" dot>
                    {t(`ceremonies.${key}`)}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex justify-center px-2 lg:col-span-5">
          <InvitationMock />
        </div>
      </Container>
    </section>
  );
}
