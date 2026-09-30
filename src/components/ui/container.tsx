import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Page-width wrapper with the Stitch margins: 24px on phones, 40px on desktop. */
export function Container({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mx-auto w-full max-w-page px-6 lg:px-10', className)} {...props} />;
}
