import { getTranslations } from 'next-intl/server';
import { Container } from '@/components/ui/container';
import { CheckIcon } from '@/components/ui/icons';
import { Section } from '@/components/ui/section';
import { Eyebrow, Heading, Lead } from '@/components/ui/typography';
import { cn } from '@/lib/cn';
import { InviteMock } from './mocks/invite-mock';
import { MemoriesMock } from './mocks/memories-mock';
import { NumbersMock } from './mocks/numbers-mock';
import { PlanMock } from './mocks/plan-mock';

const CHAPTERS = [
  { key: 'plan', Mock: PlanMock },
  { key: 'invite', Mock: InviteMock },
  { key: 'numbers', Mock: NumbersMock },
  { key: 'memories', Mock: MemoriesMock },
] as const;

const POINTS = ['one', 'two'] as const;

/** Four alternating rows, one per core feature area, each with an arched mock-up. */
export async function Chapters() {
  const t = await getTranslations('landing.chapters');

  return (
    <Section id="features" className="scroll-mt-20">
      <Container className="flex flex-col gap-20 md:gap-24">
        {CHAPTERS.map(({ key, Mock }, i) => (
          <article key={key} className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
            <div className={cn('flex flex-col gap-5 lg:col-span-5', i % 2 === 1 && 'lg:order-2')}>
              <Eyebrow>{t(`${key}.eyebrow`)}</Eyebrow>
              <Heading>{t(`${key}.title`)}</Heading>
              <Lead>{t(`${key}.body`)}</Lead>
              <ul className="flex flex-col gap-3 pt-2">
                {POINTS.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-body text-ink">
                    <CheckIcon className="mt-px shrink-0 text-secondary-ink" />
                    {t(`${key}.points.${p}`)}
                  </li>
                ))}
              </ul>
            </div>
            <div className={cn('flex justify-center lg:col-span-7', i % 2 === 1 && 'lg:order-1')}>
              <Mock />
            </div>
          </article>
        ))}
      </Container>
    </Section>
  );
}
