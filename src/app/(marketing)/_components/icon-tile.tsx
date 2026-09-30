import type { ReactNode } from 'react';

/** Rounded square behind a feature icon, in text-safe brass on a neutral fill. */
export function IconTile({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-fill text-secondary-ink">
      {children}
    </span>
  );
}
