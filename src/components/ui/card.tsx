import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Resting card (Stitch "Layer 1"): white surface, hairline border, soft shadow. */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-card border border-line bg-surface p-5 text-ink shadow-card md:p-7',
        className,
      )}
      {...props}
    />
  );
}

/** Jharokha-arched card for feature previews: arched top corners, floating shadow. */
export function ArchCard({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-t-arch rounded-b-card bg-surface p-6 text-ink shadow-float sm:p-8',
        className,
      )}
      {...props}
    />
  );
}

/** Tinted band across the top of an ArchCard. Bleeds to the card's edges. */
export function ArchCardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('-mx-6 -mt-2 mb-6 bg-canvas-muted px-6 pt-2 pb-4 sm:-mx-8 sm:px-8', className)}
      {...props}
    />
  );
}
