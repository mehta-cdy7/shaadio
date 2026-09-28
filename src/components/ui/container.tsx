import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Page-width wrapper with the Stitch margins: 20px mobile, 32px tablet, 48px desktop. */
export function Container({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('mx-auto w-full max-w-page px-5 md:px-8 lg:px-12', className)} {...props} />
  );
}
