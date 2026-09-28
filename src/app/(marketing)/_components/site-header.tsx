import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { Logo } from './logo';

const SECTIONS = ['features', 'howItWorks', 'privacy', 'faq'] as const;
const ANCHORS: Record<(typeof SECTIONS)[number], string> = {
  features: '#features',
  howItWorks: '#how-it-works',
  privacy: '#privacy',
  faq: '#faq',
};

export async function SiteHeader() {
  const t = await getTranslations('landing.nav');

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between gap-4 md:h-18">
        <Logo />
        <nav aria-label={t('label')} className="hidden items-center gap-8 md:flex">
          {SECTIONS.map((key) => (
            <a
              key={key}
              href={ANCHORS[key]}
              className="text-body-sm font-medium text-ink-muted transition-colors hover:text-ink"
            >
              {t(key)}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3 md:gap-5">
          <Link
            href="/login"
            className="text-body-sm font-medium text-ink-muted transition-colors hover:text-ink"
          >
            {t('signIn')}
          </Link>
          <ButtonLink href="/signup">{t('startPlanning')}</ButtonLink>
        </div>
      </Container>
    </header>
  );
}
