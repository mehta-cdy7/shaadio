import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/button';
import { Eyebrow, Heading, Lead } from '@/components/ui/typography';

/**
 * Placeholder for sign-in surfaces until the auth increment lands, so landing-page links never 404.
 * Replace each page that uses it with the real form.
 */
export async function ComingSoon({ page }: { page: 'signIn' | 'signUp' }) {
  const t = await getTranslations('comingSoon');

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <Eyebrow>{t('eyebrow')}</Eyebrow>
      <Heading as="h1" size="headline-md">
        {t(`${page}.title`)}
      </Heading>
      <Lead>{t('body')}</Lead>
      <ButtonLink href="/" variant="outline" className="mt-2">
        {t('backHome')}
      </ButtonLink>
    </main>
  );
}
