import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';
import { Eyebrow, Heading, Lead } from '@/components/ui/typography';

export async function WorkspacePreview() {
  const t = await getTranslations('landing.workspace');

  return (
    <Section className="border-t border-line">
      <Container className="flex flex-col items-center gap-4 text-center">
        <Eyebrow>{t('eyebrow')}</Eyebrow>
        <Heading className="max-w-2xl">{t('title')}</Heading>
        <Lead className="max-w-2xl">{t('body')}</Lead>
        <div className="mt-8 w-full overflow-hidden rounded-card border border-line shadow-float">
          <Image
            src="/images/landing/workspace.webp"
            alt={t('imageAlt')}
            width={1600}
            height={1022}
            sizes="(min-width: 1200px) 1104px, 92vw"
            className="h-auto w-full"
          />
        </div>
      </Container>
    </Section>
  );
}
