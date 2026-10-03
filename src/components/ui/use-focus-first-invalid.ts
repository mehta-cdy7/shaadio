'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Moves focus to the first `aria-invalid` control in the form whenever `errors` changes, so
 * keyboard and screen-reader users land on the problem with its message read out. Runs after
 * render, when the error text is already linked through `aria-describedby`.
 */
export function useFocusFirstInvalid(formRef: RefObject<HTMLFormElement | null>, errors: object) {
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [formRef, errors]);
}
