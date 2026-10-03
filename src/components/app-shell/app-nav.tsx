'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { isActive, MAIN_NAV, SETTINGS_NAV } from './nav-items';

// Looked up here, not passed in: icons are components, which can't cross from a server component.
const GROUPS = {
  main: MAIN_NAV,
  settings: [SETTINGS_NAV],
  all: [...MAIN_NAV, SETTINGS_NAV],
};

/** A list of workspace links; the current section is highlighted and marked `aria-current`. */
export function AppNav({
  group,
  onNavigate,
}: {
  group: keyof typeof GROUPS;
  onNavigate?: () => void;
}) {
  const t = useTranslations('members.shell.nav');
  const pathname = usePathname();

  return (
    <ul className="flex flex-col gap-1">
      {GROUPS[group].map(({ key, href, icon: Icon }) => {
        const active = isActive(href, pathname);
        return (
          <li key={key}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-control px-3.5 py-2.5 text-body-lg transition-colors',
                'focus-visible:outline-2 focus-visible:outline-focus',
                active
                  ? 'bg-primary-soft font-medium text-on-primary-soft'
                  : 'text-ink hover:bg-fill',
              )}
            >
              <Icon width={20} height={20} className="shrink-0" />
              {t(key)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
