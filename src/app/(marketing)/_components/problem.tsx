import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { Container } from '@/components/ui/container';
import { ChatIcon, PhoneIcon, PhotosIcon, TableIcon } from '@/components/ui/icons';
import { Section } from '@/components/ui/section';
import { IconTile } from './icon-tile';
import { SectionIntro } from './section-intro';

const ITEMS = [
  { key: 'whatsapp', Icon: ChatIcon },
  { key: 'excel', Icon: TableIcon },
  { key: 'vendors', Icon: PhoneIcon },
  { key: 'photos', Icon: PhotosIcon },
] as const;

export async function Problem() {
  const t = await getTranslations('landing.problem');

  return (
    <Section tone="sunken">
      <Container className="flex flex-col items-center gap-12">
        <SectionIntro
          eyebrow={t('eyebrow')}
          title={t('title')}
          body={t('body')}
          className="max-w-3xl"
        />
        <ul className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map(({ key, Icon }) => (
            <li key={key}>
              <Card className="flex h-full flex-col gap-6">
                <IconTile>
                  <Icon className="size-6" />
                </IconTile>
                <div className="flex flex-col gap-2">
                  <h3 className="text-title font-semibold text-ink-accent">
                    {t(`items.${key}.title`)}
                  </h3>
                  <p className="text-body-sm text-ink-muted">{t(`items.${key}.body`)}</p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
        <p className="flex items-center gap-3 rounded-full bg-surface px-6 py-3 text-center text-title font-medium text-ink-accent shadow-card">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-secondary-ink" />
          {t('closing')}
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-secondary-ink" />
        </p>
      </Container>
    </Section>
  );
}
