import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';
import { Eyebrow, Heading } from '@/components/ui/typography';

const ITEMS = ['whatsapp', 'excel', 'vendors', 'photos'] as const;

export async function Problem() {
  const t = await getTranslations('landing.problem');

  return (
    <Section tone="muted">
      <Container className="flex flex-col items-center gap-10 text-center">
        <div className="flex flex-col items-center gap-4">
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <Heading className="max-w-2xl">{t('title')}</Heading>
        </div>
        <ol className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map((key, i) => (
            <li key={key}>
              <Card className="flex h-full flex-col gap-3 text-left">
                <span className="font-display text-headline-sm text-secondary">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <p className="text-body text-ink">{t(`items.${key}`)}</p>
              </Card>
            </li>
          ))}
        </ol>
        <p className="font-display text-headline-sm text-ink italic">{t('closing')}</p>
      </Container>
    </Section>
  );
}
