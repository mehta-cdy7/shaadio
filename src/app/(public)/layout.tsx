import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * Guest surfaces: /invite/[token], /gallery/[token], /w/[slug] (SYSTEM_DESIGN §7.2–7.3).
 * Unlisted and token-bearing: never indexed, and never leak the URL through Referer (API_DESIGN §8.1).
 * Keep this layout lean — budget Android on 4G (SYSTEM_DESIGN §3.6). No pages yet.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function PublicLayout({ children }: { children: ReactNode }) {
  return children;
}
