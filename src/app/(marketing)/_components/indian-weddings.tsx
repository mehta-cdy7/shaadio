import { getTranslations } from 'next-intl/server';
import { Fragment } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Container } from '@/components/ui/container';
import { ChecklistIcon, RupeeIcon, TagIcon, UsersIcon } from '@/components/ui/icons';
import { Section } from '@/components/ui/section';
import { CEREMONIES } from './ceremonies';
import { IconTile } from './icon-tile';
import { SectionIntro } from './section-intro';

const ITEMS = [
  { key: 'events', Icon: ChecklistIcon },
  { key: 'sides', Icon: TagIcon },
  { key: 'households', Icon: UsersIcon },
  { key: 'rupees', Icon: RupeeIcon },
] as const;

export async function IndianWeddings() {
  const t = await getTranslations('landing');

  return (
    <Section tone="sunken">
      <Container className="flex flex-col gap-12">
        <div className="flex flex-col items-center gap-6">
          <SectionIntro
            eyebrow={t('indian.eyebrow')}
            title={t('indian.title')}
            body={t('indian.body')}
            className="max-w-3xl"
          />
          <ul className="flex flex-wrap items-center justify-center gap-2">
            {CEREMONIES.map((key, i) => (
              <Fragment key={key}>
                {i > 0 && (
                  <li aria-hidden="true" className="text-label-sm text-secondary-ink">
                    ·
                  </li>
                )}
                <li>
                  <Badge tone="plain">{t(`ceremonies.${key}`)}</Badge>
                </li>
              </Fragment>
            ))}
          </ul>
        </div>
        <ul className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {ITEMS.map(({ key, Icon }) => (
            <li key={key}>
              <Card className="flex h-full items-start gap-5">
                <IconTile>
                  <Icon className="size-5.5" />
                </IconTile>
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-title font-semibold text-ink-accent">
                    {t(`indian.items.${key}.title`)}
                  </h3>
                  <p className="text-body text-ink-muted">{t(`indian.items.${key}.body`)}</p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
