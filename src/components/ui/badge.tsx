import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'accent' | 'plain' | 'soft' | 'success' | 'pending' | 'danger';
type Size = 'sm' | 'md';

const tones: Record<Tone, string> = {
  neutral: 'bg-fill text-ink-muted',
  // Ceremony and category chips.
  accent: 'bg-fill text-ink-accent shadow-card',
  // Chips on a tinted band, where a fill would disappear.
  plain: 'bg-surface text-ink-accent shadow-card',
  soft: 'bg-primary-soft text-on-primary-soft',
  // RSVP and task states: attending/done, waiting for a reply.
  success: 'bg-success-subtle text-success',
  pending: 'bg-pending text-on-pending',
  // Overdue tasks.
  danger: 'bg-danger-subtle text-danger',
};

const sizes: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-label-sm',
  md: 'px-3.5 py-1.5 text-label',
};

/** Pill-shaped tag for statuses, ceremony names and filters. `dot` adds the brass bullet. */
export function Badge({
  tone = 'neutral',
  size = 'md',
  dot = false,
  className,
  children,
  ...props
}: ComponentProps<'span'> & { tone?: Tone; size?: Size; dot?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap',
        tones[tone],
        sizes[size],
        className,
      )}
      {...props}
    >
      {dot && <span aria-hidden="true" className="size-1 rounded-full bg-secondary-ink" />}
      {children}
    </span>
  );
}
