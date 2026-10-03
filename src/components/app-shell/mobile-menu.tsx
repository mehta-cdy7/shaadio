'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CloseIcon, MenuIcon } from '@/components/ui/icons';
import { AppNav } from './app-nav';

/**
 * Phone navigation: a menu button that opens the workspace links in a modal sheet. The native
 * <dialog> handles focus trapping, Escape and the backdrop.
 */
export function MobileMenu({ footer }: { footer: ReactNode }) {
  const t = useTranslations('members.shell');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  const close = () => dialogRef.current?.close();

  // Close after navigating, including back/forward.
  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={t('openMenu')}
        className="flex size-10 items-center justify-center rounded-control text-ink hover:bg-fill focus-visible:outline-2 focus-visible:outline-focus"
      >
        <MenuIcon width={22} height={22} />
      </button>
      <dialog
        ref={dialogRef}
        aria-label={t('navLabel')}
        // Clicking the backdrop (the dialog element itself, outside the panel) closes it.
        onClick={(event) => event.target === event.currentTarget && close()}
        className="ml-auto h-dvh max-h-dvh w-80 max-w-[85vw] bg-surface p-0 text-ink shadow-float backdrop:bg-ink/40"
      >
        <div className="flex h-full flex-col gap-6 px-4 py-5">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={close}
              aria-label={t('closeMenu')}
              className="flex size-10 items-center justify-center rounded-control hover:bg-fill focus-visible:outline-2 focus-visible:outline-focus"
            >
              <CloseIcon width={22} height={22} />
            </button>
          </div>
          <nav aria-label={t('navLabel')} className="flex-1 overflow-y-auto">
            <AppNav group="all" onNavigate={close} />
          </nav>
          {footer}
        </div>
      </dialog>
    </>
  );
}
