import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';
import { Eyebrow, Heading, Lead } from '@/components/ui/typography';
import { CEREMONIES } from './hero';

const ITEMS = ['events', 'sides', 'households', 'rupees'] as const;

export async function IndianWeddings() {
  const t = await getTranslations('landing');

  return (
    <Section>
      <Container className="flex flex-col gap-10">
        <div className="flex flex-col items-center gap-4 text-center">
          <Eyebrow>{t('indian.eyebrow')}</Eyebrow>
          <Heading className="max-w-2xl">{t('indian.title')}</Heading>
          <Lead className="max-w-2xl">{t('indian.body')}</Lead>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {CEREMONIES.map((key) => (
              <Badge key={key} tone="accent">
                {t(`ceremonies.${key}`)}
              </Badge>
            ))}
          </div>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map((key) => (
            <li key={key}>
              <Card className="flex h-full flex-col gap-2">
                <h3 className="font-display text-headline-sm">{t(`indian.items.${key}.title`)}</h3>
                <p className="text-body text-ink-muted">{t(`indian.items.${key}.body`)}</p>
              </Card>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
