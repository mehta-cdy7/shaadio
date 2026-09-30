import { getTranslations } from 'next-intl/server';
import { Container } from '@/components/ui/container';
import { Section } from '@/components/ui/section';
import { WorkspaceMock } from './mocks/workspace-mock';
import { SectionIntro } from './section-intro';

export async function WorkspacePreview() {
  const t = await getTranslations('landing.workspace');

  return (
    <Section tone="muted">
      <Container className="flex flex-col gap-10">
        <SectionIntro
          eyebrow={t('eyebrow')}
          title={t('title')}
          body={t('body')}
          className="max-w-2xl"
        />
        <WorkspaceMock />
      </Container>
    </Section>
  );
}
