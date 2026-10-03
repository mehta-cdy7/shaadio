import type { ComponentType, SVGProps } from 'react';
import {
  CalendarIcon,
  CheckCircleIcon,
  DashboardIcon,
  GlobeIcon,
  MailIcon,
  PhotosIcon,
  RupeeIcon,
  SettingsIcon,
  StoreIcon,
  UsersIcon,
  VideoIcon,
} from '@/components/ui/icons';

export type NavKey =
  | 'dashboard'
  | 'events'
  | 'guests'
  | 'invitations'
  | 'tasks'
  | 'expenses'
  | 'vendors'
  | 'website'
  | 'photos'
  | 'livestream'
  | 'settings';

export type NavItem = { key: NavKey; href: string; icon: ComponentType<SVGProps<SVGSVGElement>> };

/**
 * Workspace navigation (PRD §10, simplified as it allows). Sections not built yet 404 until their
 * slice lands; settings sits apart at the bottom of the sidebar.
 */
export const MAIN_NAV: readonly NavItem[] = [
  { key: 'dashboard', href: '/app', icon: DashboardIcon },
  { key: 'events', href: '/app/events', icon: CalendarIcon },
  { key: 'guests', href: '/app/guests', icon: UsersIcon },
  { key: 'invitations', href: '/app/invitations', icon: MailIcon },
  { key: 'tasks', href: '/app/tasks', icon: CheckCircleIcon },
  { key: 'expenses', href: '/app/expenses', icon: RupeeIcon },
  { key: 'vendors', href: '/app/vendors', icon: StoreIcon },
  { key: 'website', href: '/app/website', icon: GlobeIcon },
  { key: 'photos', href: '/app/photos', icon: PhotosIcon },
  { key: 'livestream', href: '/app/livestream', icon: VideoIcon },
];

export const SETTINGS_NAV: NavItem = { key: 'settings', href: '/app/settings', icon: SettingsIcon };

/** The dashboard matches only itself; every other section also matches its sub-pages. */
export function isActive(href: string, pathname: string): boolean {
  if (href === '/app') return pathname === '/app';
  return pathname === href || pathname.startsWith(`${href}/`);
}
