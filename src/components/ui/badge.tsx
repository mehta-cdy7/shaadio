import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'accent';

const tones: Record<Tone, string> = {
  neutral: 'border-line bg-surface text-ink-muted',
  accent: 'border-secondary bg-secondary-subtle text-on-secondary',
};

/** Pill-shaped tag for statuses, ceremony names and filters. */
export function Badge({
  tone = 'neutral',
  className,
  ...props
}: ComponentProps<'span'> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-label-sm font-medium',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
