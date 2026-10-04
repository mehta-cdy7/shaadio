'use client';

import { useEffect } from 'react';

/**
 * Warns before leaving a page with unsaved edits, while `dirty` is true.
 *
 * - In-app links (sidebar, logo, tabs, any `<a>`): a click is checked before Next's router sees
 *   it, in the capture phase on the document, so every link is covered without touching each one.
 *   Cancelling stops the navigation. New-tab clicks and same-page links are left alone.
 * - Reload, closing the tab, typing a URL: the browser's own "leave site?" prompt
 *   (`beforeunload`), the only kind browsers allow there.
 *
 * Browser back/forward inside the app is not intercepted: the App Router has no supported way to
 * block it.
 */
export function useUnsavedChangesWarning(dirty: boolean, message: string) {
  useEffect(() => {
    if (!dirty) return;

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.target && link.target !== '_self') return;
      if (link.hasAttribute('download')) return;
      const url = new URL(link.href, window.location.href);
      const here = window.location;
      if (
        url.origin === here.origin &&
        url.pathname === here.pathname &&
        url.search === here.search
      ) {
        return;
      }
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Older browsers need returnValue set to show the prompt.
      event.returnValue = '';
    }

    document.addEventListener('click', onClick, true);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [dirty, message]);
}
