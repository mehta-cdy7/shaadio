import { getTranslations } from 'next-intl/server';
import { Container } from '@/components/ui/container';
import { Logo } from './logo';

export async function SiteFooter() {
  const t = await getTranslations('landing');

  return (
    <footer className="border-t border-line bg-canvas py-10">
      <Container className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <Logo />
          <p className="text-body-sm text-ink-muted">{t('footer.tagline')}</p>
        </div>
        <div className="flex flex-col gap-3 md:items-end">
          <nav aria-label={t('nav.label')} className="flex flex-wrap gap-6">
            <a href="#features" className="text-body-sm text-ink-muted hover:text-ink">
              {t('nav.features')}
            </a>
            <a href="#privacy" className="text-body-sm text-ink-muted hover:text-ink">
              {t('nav.privacy')}
            </a>
            <a href="#faq" className="text-body-sm text-ink-muted hover:text-ink">
              {t('nav.faq')}
            </a>
          </nav>
          <p className="text-body-sm text-ink-muted">
            {t('footer.copyright', { year: new Date().getFullYear() })}
          </p>
        </div>
      </Container>
    </footer>
  );
}
