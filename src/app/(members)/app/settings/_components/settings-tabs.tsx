'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { SETTINGS_TABS } from './settings-tabs-list';

/** Which ends of the strip have tabs scrolled out of view. */
type Overflow = { start: boolean; end: boolean };

/** Fades the edge(s) with hidden tabs, so it is clear the strip scrolls (phones). */
const FADE: Record<string, string> = {
  'false-true': '[mask-image:linear-gradient(to_right,black_80%,transparent)]',
  'true-false': '[mask-image:linear-gradient(to_left,black_80%,transparent)]',
  'true-true': '[mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)]',
};

/**
 * Settings sub-navigation; Managers see only the tabs open to them. On narrow screens the strip
 * scrolls sideways: the current tab is scrolled into view and the cut-off edge fades out.
 */
export function SettingsTabs({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations('members.settings');
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState<Overflow>({ start: false, end: false });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () =>
      setOverflow({
        start: el.scrollLeft > 1,
        end: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
      });
    el.querySelector('[aria-current="page"]')?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [pathname]);

  return (
    <nav aria-label={t('tabsLabel')} className="border-b border-line">
      <div
        ref={scrollRef}
        className={cn('-mb-px overflow-x-auto', FADE[`${overflow.start}-${overflow.end}`])}
      >
        <ul className="flex min-w-max gap-6">
          {SETTINGS_TABS.filter((tab) => isAdmin || !tab.adminOnly).map((tab) => {
            const active = pathname === tab.href;
            return (
              <li key={tab.key}>
                <Link
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'block border-b-2 pb-3 text-body-lg whitespace-nowrap transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-focus',
                    active
                      ? 'border-primary font-medium text-ink'
                      : 'border-transparent text-ink-muted hover:text-ink',
                  )}
                >
                  {t(`tabs.${tab.key}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
