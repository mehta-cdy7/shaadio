import type { ReactNode } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Logo } from '@/components/ui/logo';

/**
 * Split layout for sign-in surfaces (Stitch "Sign In" / "Create Account" / "Join by Invitation"):
 * the form on the canvas, a decorative panel on the right from lg up. Phones get the form only.
 */
export async function AuthShell({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  const t = await getTranslations('auth.footer');

  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-2">
      <div className="flex flex-col px-4 py-8 sm:px-14 lg:px-20 lg:py-12">
        <header>
          <Logo />
        </header>
        <main className="mx-auto my-auto w-full max-w-100 py-10">{children}</main>
        <footer>
          <nav
            aria-label={t('label')}
            className="flex justify-center gap-3 text-label text-ink-muted"
          >
            <Link href="/" className="hover:text-ink-accent hover:underline">
              {t('home')}
            </Link>
            <span aria-hidden="true">·</span>
            <Link href="/#privacy" className="hover:text-ink-accent hover:underline">
              {t('privacy')}
            </Link>
          </nav>
        </footer>
      </div>
      <aside className="hidden items-center justify-center border-l border-secondary bg-panel p-16 lg:flex">
        {aside}
      </aside>
    </div>
  );
}
