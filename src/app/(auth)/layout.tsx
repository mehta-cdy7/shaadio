import type { ReactNode } from 'react';

/**
 * Sign-in surfaces: /login, /signup, /forgot-password, /reset-password, /join/[token].
 * /login, /signup and /join/[token] are live; the others arrive with their slices.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}
