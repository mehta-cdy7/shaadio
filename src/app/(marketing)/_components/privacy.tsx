import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { Container } from '@/components/ui/container';
import { EyeOffIcon, LockIcon, ShieldCheckIcon, TrashIcon } from '@/components/ui/icons';
import { Section } from '@/components/ui/section';
import { SectionIntro } from './section-intro';

const ITEMS = [
  { key: 'links', Icon: ShieldCheckIcon },
  { key: 'unlisted', Icon: EyeOffIcon },
  { key: 'gallery', Icon: LockIcon },
  { key: 'delete', Icon: TrashIcon },
] as const;

export async function Privacy() {
  const t = await getTranslations('landing.privacy');

  return (
    <Section id="privacy" tone="sunken" className="scroll-mt-20">
      <Container className="flex flex-col gap-12">
        <SectionIntro
          eyebrow={t('eyebrow')}
          title={t('title')}
          body={t('body')}
          className="max-w-2xl"
        />
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {ITEMS.map(({ key, Icon }) => (
            <li key={key}>
              <Card className="flex h-full flex-col gap-2">
                <span className="mb-3 flex size-9 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft">
                  <Icon className="size-4.5" />
                </span>
                <h3 className="text-title font-semibold text-ink-accent">
                  {t(`items.${key}.title`)}
                </h3>
                <p className="text-body-sm text-ink-muted">{t(`items.${key}.body`)}</p>
              </Card>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
