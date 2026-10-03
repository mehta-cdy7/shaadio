import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { HeartIcon } from '@/components/ui/icons';
import { Logo } from '@/components/ui/logo';
import { coupleNames } from '@/lib/couple';
import { formatCalendarDate } from '@/lib/dates';
import { AppNav } from './app-nav';
import { MobileMenu } from './mobile-menu';

export type ShellWedding = {
  brideName: string;
  groomName: string;
  nameOrder?: 'BRIDE_FIRST' | 'GROOM_FIRST';
  weddingDate: string;
};
export type ShellMember = { name: string; role: 'ADMIN' | 'MANAGER' };

/**
 * Signed-in workspace chrome (PRD §10, §12.1 "wedding first"): a sidebar with the couple's names on
 * desktop, a top bar with the names and a menu on phones. `signOut` is passed in because the
 * button lives with the app's routes.
 */
export async function AppShell({
  wedding,
  member,
  signOut,
  children,
}: {
  wedding: ShellWedding;
  member: ShellMember;
  signOut: ReactNode;
  children: ReactNode;
}) {
  const t = await getTranslations('members.shell');
  const [first, second] = coupleNames(wedding);
  const date = formatCalendarDate(wedding.weddingDate, 'short');

  const memberRow = (
    <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
      <div className="min-w-0">
        <p className="truncate text-body text-ink">{member.name}</p>
        <p className="text-label-sm font-semibold tracking-widest text-secondary-ink uppercase">
          {t(`role.${member.role}`)}
        </p>
      </div>
      {signOut}
    </div>
  );

  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[17rem_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2 focus:shadow-float"
      >
        {t('skipToContent')}
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line bg-surface px-4 py-7 lg:flex">
        <div className="px-2">
          <Logo mark={false} />
        </div>
        <div className="rounded-card border border-line bg-canvas-muted px-4 py-3">
          {/* Wraps instead of truncating, so long names stay readable; the card grows to fit. */}
          <p
            title={`${first} & ${second}`}
            className="font-display text-title [overflow-wrap:anywhere] text-ink"
          >
            {first}{' '}
            <HeartIcon
              width={13}
              height={13}
              className="inline-block fill-secondary-ink align-[-0.1em] text-secondary-ink"
            />{' '}
            {second}
          </p>
          <p className="text-body-sm text-ink-muted">{date}</p>
        </div>
        <nav aria-label={t('navLabel')} className="flex-1 overflow-y-auto">
          <AppNav group="main" />
        </nav>
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <AppNav group="settings" />
          {memberRow}
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-canvas px-4 py-3 sm:px-8 lg:hidden">
          <Logo mark={false} />
          <div className="min-w-0 text-center">
            <p className="truncate font-display text-title text-ink">
              {first} &amp; {second}
            </p>
            <p className="text-label text-ink-muted">{date}</p>
          </div>
          <MobileMenu footer={memberRow} />
        </header>
        <main id="main" className="mx-auto w-full max-w-page px-4 py-6 sm:px-8 lg:px-12 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
