import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

/**
 * Wraps a product mock-up. Its labels are sample data, not page content, so screen readers get one
 * description (role="img") instead of every label inside.
 */
export function MockFigure({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="img" aria-label={label} className={className}>
      {children}
    </div>
  );
}

export type RsvpStatus = 'attending' | 'pending' | 'notAttending';

const RSVP_TONES = { attending: 'success', pending: 'pending', notAttending: 'neutral' } as const;

/** RSVP state (PRD §9.7): green when attending, sandalwood while pending, neutral otherwise. */
export function RsvpBadge({ status, children }: { status: RsvpStatus; children: ReactNode }) {
  return (
    <Badge size="sm" tone={RSVP_TONES[status]}>
      {children}
    </Badge>
  );
}

/** Thin progress bar; `value` is a percentage. */
export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-fill', className)}>
      <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
    </div>
  );
}
