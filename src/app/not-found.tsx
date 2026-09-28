import { getTranslations } from 'next-intl/server';

/**
 * Generic not-found page. Public links reuse it so an invalid, regenerated or deleted link all look
 * the same (API_DESIGN §4.4).
 */
export default async function NotFound() {
  const t = await getTranslations('notFound');

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-6 text-center">
      <h1 className="font-display text-headline-md text-ink">{t('title')}</h1>
      <p className="text-ink-muted">{t('body')}</p>
    </main>
  );
}
