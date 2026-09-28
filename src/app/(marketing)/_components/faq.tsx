import { getTranslations } from 'next-intl/server';
import { Container } from '@/components/ui/container';
import { PlusIcon } from '@/components/ui/icons';
import { Section } from '@/components/ui/section';
import { Eyebrow, Heading } from '@/components/ui/typography';

const ITEMS = ['free', 'download', 'parents', 'guestList', 'photos'] as const;

/** Native <details>: accessible and needs no client JavaScript. */
export async function Faq() {
  const t = await getTranslations('landing.faq');

  return (
    <Section id="faq" tone="muted" className="scroll-mt-20">
      <Container className="flex max-w-3xl flex-col gap-10">
        <div className="flex flex-col items-center gap-4 text-center">
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <Heading>{t('title')}</Heading>
        </div>
        <div className="divide-y divide-line border-y border-line">
          {ITEMS.map((key) => (
            <details key={key} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-title font-semibold [&::-webkit-details-marker]:hidden">
                {t(`items.${key}.q`)}
                <PlusIcon className="shrink-0 text-secondary transition-transform group-open:rotate-45" />
              </summary>
              <p className="pt-3 text-body text-ink-muted">{t(`items.${key}.a`)}</p>
            </details>
          ))}
        </div>
      </Container>
    </Section>
  );
}
