import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { AlertIcon } from './icons';

/**
 * Form-level error banner. `role="alert"` makes screen readers announce it when it appears, so
 * render it only once there is an error.
 */
export function Alert({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2.5 rounded-control border border-danger/20 bg-danger-subtle px-3.5 py-3 text-body font-medium text-danger',
        className,
      )}
      {...props}
    >
      <AlertIcon width={16} height={16} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
