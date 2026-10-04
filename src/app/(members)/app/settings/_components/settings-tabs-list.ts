/** Settings sections (PRD §9.25). Members, Activity log and Danger zone are Admin-only. */
export const SETTINGS_TABS = [
  { key: 'details', href: '/app/settings', adminOnly: false },
  { key: 'members', href: '/app/settings/members', adminOnly: true },
  { key: 'activity', href: '/app/settings/activity', adminOnly: true },
  { key: 'danger', href: '/app/settings/danger-zone', adminOnly: true },
] as const;
