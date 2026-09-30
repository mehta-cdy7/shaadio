import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'outline' | 'ghost' | 'inverse';
type Size = 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-control font-sans font-semibold transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary shadow-card hover:bg-primary-hover',
  // Stitch "secondary": white surface and hairline; hover tints towards the primary.
  outline:
    'border border-line bg-surface text-ink shadow-card hover:border-primary hover:bg-primary-subtle',
  ghost: 'bg-transparent text-ink-accent underline-offset-4 decoration-secondary hover:underline',
  // For use on the closing band: a light button on the dark band.
  inverse: 'bg-on-band text-band shadow-card hover:bg-on-band/90',
};

// md shrinks on phones so the header fits a 360px screen.
const sizes: Record<Size, string> = {
  md: 'h-10 px-4 text-body-sm md:h-11 md:px-5 md:text-title',
  lg: 'h-13 px-6 text-title',
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
