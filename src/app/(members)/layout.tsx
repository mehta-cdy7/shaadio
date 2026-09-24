import type { ReactNode } from 'react';

/**
 * Signed-in surfaces: /onboarding (create or join a wedding) and the /app/* workspace (SYSTEM_DESIGN §7.1).
 * The server-side session + membership gate lands here with the auth increment. No pages yet.
 */
export default function MembersLayout({ children }: { children: ReactNode }) {
  return children;
}
