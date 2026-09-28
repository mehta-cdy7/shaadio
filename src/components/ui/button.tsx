import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'outline' | 'ghost' | 'inverse';
type Size = 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-control font-sans font-semibold transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  outline: 'border border-secondary bg-transparent text-ink hover:bg-canvas-muted',
  ghost: 'bg-transparent text-ink underline-offset-4 decoration-secondary hover:underline',
  // For use on a bg-primary band: swaps foreground and background.
  inverse: 'bg-on-primary text-primary hover:bg-primary-subtle',
};

const sizes: Record<Size, string> = {
  md: 'h-10 px-4 text-body-sm',
  lg: 'h-12 px-6 text-body',
};

export type ButtonStyleProps = { variant?: Variant; size?: Size };

export function buttonClasses({ variant = 'primary', size = 'md' }: ButtonStyleProps = {}): string {
  return cn(base, variants[variant], sizes[size]);
}

export function Button({
  variant,
  size,
  className,
  type = 'button',
  ...props
}: ComponentProps<'button'> & ButtonStyleProps) {
  return (
    <button type={type} className={cn(buttonClasses({ variant, size }), className)} {...props} />
  );
}

/** A link that looks like a button. Use for navigation; use Button for actions. */
export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & ButtonStyleProps) {
  return <Link className={cn(buttonClasses({ variant, size }), className)} {...props} />;
}
