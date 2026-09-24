import type { ReactNode } from 'react';

/**
 * Sign-in surfaces: /login, /signup, /forgot-password, /reset-password, /join/[token].
 * No pages yet — they arrive with the auth increment.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}
