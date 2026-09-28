import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Paper-cut card: white surface, 1px hairline, no shadow by default (Stitch "Layer 1"). */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-card border border-line bg-surface p-6 text-ink', className)}
      {...props}
    />
  );
}
