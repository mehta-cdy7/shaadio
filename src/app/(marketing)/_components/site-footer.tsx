import { getTranslations } from 'next-intl/server';
import { Container } from '@/components/ui/container';
import { Logo } from './logo';

const LINKS = [
  { key: 'features', href: '#features' },
  { key: 'privacy', href: '#privacy' },
  { key: 'faq', href: '#faq' },
] as const;

export async function SiteFooter() {
  const t = await getTranslations('landing');

  return (
    <footer className="border-t border-line bg-canvas-muted">
      <Container className="py-12">
        <div className="flex flex-col items-start justify-between gap-6 border-b border-line pb-8 md:flex-row md:items-center">
          <div className="flex flex-col gap-1">
            <Logo mark={false} />
            <p className="text-body-sm text-ink-muted">{t('footer.tagline')}</p>
          </div>
          <nav aria-label={t('footer.navLabel')} className="flex flex-wrap gap-6">
            {LINKS.map(({ key, href }) => (
              <a
                key={key}
                href={href}
                className="text-body-sm text-ink-muted transition-colors hover:text-ink"
              >
                {t(`nav.${key}`)}
              </a>
            ))}
          </nav>
        </div>
        <p className="pt-6 text-body-sm text-ink-muted">
          {t('footer.copyright', { year: new Date().getFullYear() })}
        </p>
      </Container>
    </footer>
  );
}
