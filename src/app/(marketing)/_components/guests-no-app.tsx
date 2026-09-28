import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { Container } from '@/components/ui/container';
import { ChatIcon, KeyIcon, PhoneIcon } from '@/components/ui/icons';
import { Section } from '@/components/ui/section';
import { Eyebrow, Heading, Lead } from '@/components/ui/typography';

const ITEMS = [
  { key: 'whatsapp', Icon: ChatIcon },
  { key: 'phone', Icon: PhoneIcon },
  { key: 'password', Icon: KeyIcon },
] as const;

export async function GuestsNoApp() {
  const t = await getTranslations('landing.guests');

  return (
    <Section tone="muted">
      <Container className="flex flex-col items-center gap-10 text-center">
        <div className="flex flex-col items-center gap-4">
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <Heading>{t('title')}</Heading>
          <Lead>{t('body')}</Lead>
        </div>
        <ul className="grid w-full gap-4 md:grid-cols-3">
          {ITEMS.map(({ key, Icon }) => (
            <li key={key}>
              <Card className="flex h-full flex-col gap-3 text-left">
                <span className="flex size-10 items-center justify-center rounded-full bg-secondary-subtle text-on-secondary">
                  <Icon />
                </span>
                <h3 className="text-title-lg font-semibold">{t(`items.${key}.title`)}</h3>
                <p className="text-body text-ink-muted">{t(`items.${key}.body`)}</p>
              </Card>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
