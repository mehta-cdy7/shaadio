import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'canvas' | 'muted' | 'primary';

const tones: Record<Tone, string> = {
  canvas: 'bg-canvas text-ink',
  muted: 'bg-canvas-muted text-ink',
  primary: 'bg-primary text-on-primary',
};

/** A full-width page band with consistent vertical rhythm. */
export function Section({
  tone = 'canvas',
  className,
  ...props
}: ComponentProps<'section'> & { tone?: Tone }) {
  return <section className={cn('py-16 md:py-24', tones[tone], className)} {...props} />;
}
