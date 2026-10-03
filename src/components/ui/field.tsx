import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { AlertIcon } from './icons';

/** Text input styles. `aria-invalid` switches the border to the danger colour. */
export const inputClasses =
  'h-12 w-full rounded-control border border-line bg-surface px-3.5 font-sans text-body-lg text-ink ' +
  'placeholder:text-ink-muted/70 transition-colors focus-visible:border-transparent focus-visible:outline-2 ' +
  'focus-visible:outline-focus aria-invalid:border-danger read-only:bg-panel read-only:text-ink-muted';

/**
 * Label, control, hint and error for one form field. The control must carry `id={id}` and
 * `aria-describedby={describedBy(id, …)}` so the hint and error are read with it.
 */
export function Field({
  id,
  label,
  action,
  hint,
  error,
  children,
}: {
  id: string;
  label: ReactNode;
  /** Shown at the end of the label row, e.g. a "Forgot password?" link. */
  action?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-body font-medium text-ink">
          {label}
        </label>
        {action}
      </div>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-label text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${id}-error`}
          className="flex items-center gap-1.5 text-label font-medium text-danger"
        >
          <AlertIcon width={14} height={14} className="shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

/** The `aria-describedby` value matching what Field renders. */
export function describedBy(id: string, { hint, error }: { hint?: unknown; error?: unknown }) {
  return cn(Boolean(hint) && !error && `${id}-hint`, Boolean(error) && `${id}-error`) || undefined;
}
