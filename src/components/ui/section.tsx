import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'canvas' | 'muted' | 'sunken' | 'band';

const tones: Record<Tone, string> = {
  canvas: 'bg-canvas text-ink',
  muted: 'bg-canvas-muted text-ink',
  sunken: 'bg-canvas-sunken text-ink',
  // The default focus colour is too faint on the dark band; use the band's own focus colour.
  band: 'bg-band text-on-band [--sh-focus:var(--sh-on-band-focus)]',
};

/** A full-width page band with consistent vertical rhythm. */
export function Section({
  tone = 'canvas',
  className,
  ...props
}: ComponentProps<'section'> & { tone?: Tone }) {
  return <section className={cn('py-16 md:py-20', tones[tone], className)} {...props} />;
}
