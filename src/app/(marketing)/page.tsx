import { getTranslations } from 'next-intl/server';

export default async function HomePage() {
  const t = await getTranslations('home');

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="font-display text-4xl text-primary">{t('title')}</h1>
      <p className="text-lg text-ink-muted">{t('tagline')}</p>
    </main>
  );
}
