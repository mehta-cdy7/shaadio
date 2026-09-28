import type { ComponentProps, ElementType } from 'react';
import { cn } from '@/lib/cn';

/** Small uppercase overline above headings ("label-uppercase" in Stitch). */
export function Eyebrow({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      className={cn('font-sans text-label font-semibold text-secondary uppercase', className)}
      {...props}
    />
  );
}

type HeadingSize = 'display' | 'headline-lg' | 'headline-md' | 'headline-sm';

// Mobile size first, desktop size from md up (Stitch defines both).
const headingSizes: Record<HeadingSize, string> = {
  display: 'text-display-sm md:text-display font-semibold',
  'headline-lg': 'text-headline-lg-sm md:text-headline-lg font-semibold',
  'headline-md': 'text-headline-sm md:text-headline-md font-medium',
  'headline-sm': 'text-headline-sm font-medium',
};

export function Heading({
  as: Tag = 'h2',
  size = 'headline-lg',
  className,
  ...props
}: ComponentProps<'h2'> & { as?: ElementType; size?: HeadingSize }) {
  return (
    <Tag className={cn('font-display text-balance', headingSizes[size], className)} {...props} />
  );
}

/** Supporting paragraph in the muted ink colour. */
export function Lead({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-body-lg text-pretty text-ink-muted', className)} {...props} />;
}
