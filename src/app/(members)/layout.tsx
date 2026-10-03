import type { ReactNode } from 'react';

/**
 * Signed-in surfaces: /onboarding (create or join a wedding) and the /app/* workspace (SYSTEM_DESIGN §7.1).
 * /onboarding is a placeholder that checks the session itself; the membership gate for /app/*
 * lands here with slice 2.
 */
export default function MembersLayout({ children }: { children: ReactNode }) {
  return children;
}
