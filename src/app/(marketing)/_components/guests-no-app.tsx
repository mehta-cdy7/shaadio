import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { Container } from '@/components/ui/container';
import { DevicesIcon, LinkIcon, LockOpenIcon } from '@/components/ui/icons';
import { Section } from '@/components/ui/section';
import { Eyebrow } from '@/components/ui/typography';
import { IconTile } from './icon-tile';
import { SectionIntro } from './section-intro';

const ITEMS = [
  { key: 'link', Icon: LinkIcon },
  { key: 'device', Icon: DevicesIcon },
  { key: 'password', Icon: LockOpenIcon },
] as const;

export async function GuestsNoApp() {
  const t = await getTranslations('landing.guests');

  return (
    <Section tone="muted">
      <Container className="flex flex-col gap-12">
        <SectionIntro
          eyebrow={t('eyebrow')}
          title={t('title')}
          body={t('body')}
          className="max-w-2xl"
        />
        <ul className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {ITEMS.map(({ key, Icon }) => (
            <li key={key}>
              <Card className="flex h-full flex-col items-start">
                <IconTile>
                  <Icon className="size-6" />
                </IconTile>
                <Eyebrow className="mt-6 mb-2">{t(`items.${key}.eyebrow`)}</Eyebrow>
                <h3 className="mb-3 text-title font-semibold text-ink-accent">
                  {t(`items.${key}.title`)}
                </h3>
                <p className="text-body text-ink-muted">{t(`items.${key}.body`)}</p>
              </Card>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
