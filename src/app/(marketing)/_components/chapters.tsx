import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Container } from '@/components/ui/container';
import { CheckIcon } from '@/components/ui/icons';
import { Section } from '@/components/ui/section';
import { Eyebrow, Heading, Lead } from '@/components/ui/typography';
import { cn } from '@/lib/cn';

const CHAPTERS = [
  { key: 'plan', width: 1200, height: 690 },
  { key: 'invite', width: 1200, height: 811 },
  { key: 'numbers', width: 1200, height: 683 },
  { key: 'memories', width: 1200, height: 666 },
] as const;

const POINTS = ['one', 'two'] as const;

/** Four alternating text/image rows, one per core feature area. */
export async function Chapters() {
  const t = await getTranslations('landing.chapters');

  return (
    <Section id="features" className="scroll-mt-20">
      <Container className="flex flex-col gap-20 md:gap-28">
        {CHAPTERS.map(({ key, width, height }, i) => (
          <article key={key} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className={cn('flex flex-col gap-5', i % 2 === 1 && 'lg:order-2')}>
              <Eyebrow>{t(`${key}.eyebrow`)}</Eyebrow>
              <Heading>{t(`${key}.title`)}</Heading>
              <Lead>{t(`${key}.body`)}</Lead>
              <ul className="flex flex-col gap-3">
                {POINTS.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-body text-ink">
                    <CheckIcon className="mt-0.5 shrink-0 text-secondary" />
                    {t(`${key}.points.${p}`)}
                  </li>
                ))}
              </ul>
            </div>
            <Image
              src={`/images/landing/chapter-${key}.webp`}
              alt={t(`${key}.imageAlt`)}
              width={width}
              height={height}
              sizes="(min-width: 1024px) 540px, 92vw"
              className="h-auto w-full"
            />
          </article>
        ))}
      </Container>
    </Section>
  );
}
