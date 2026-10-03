'use client';

import { useState, type ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { inputClasses } from './field';

/** Password input with a Show/Hide toggle. Labels come from the caller so this stays i18n-free. */
export function PasswordInput({
  showLabel,
  hideLabel,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'type'> & { showLabel: string; hideLabel: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        className={cn(inputClasses, 'pr-16', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-controls={props.id}
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md px-2 py-1 text-body font-medium text-ink-muted hover:text-ink-accent focus-visible:outline-2 focus-visible:outline-focus"
      >
        {visible ? hideLabel : showLabel}
      </button>
    </div>
  );
}
