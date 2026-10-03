'use client';

import { useCallback, useEffect, useState, type FormEvent, type RefObject } from 'react';

/**
 * Per-field form errors.
 *
 * - `setFieldErrors` shows a new set (after a submit) and moves focus to the first `aria-invalid`
 *   control, so keyboard and screen-reader users land on the problem with its message read out.
 * - `clearEdited` is the form's `onInput`: editing a field removes that field's error at once,
 *   without moving focus, so a fixed field stops looking wrong before the next submit.
 *
 * Fields are matched by their `name` attribute, which must equal the error key.
 */
export function useFieldErrors<Errors extends object>(formRef: RefObject<HTMLFormElement | null>) {
  const [fieldErrors, setErrors] = useState<Errors>({} as Errors);
  const [focusRequest, setFocusRequest] = useState(0);

  useEffect(() => {
    if (focusRequest === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [formRef, focusRequest]);

  const setFieldErrors = useCallback((next: Errors) => {
    setErrors(next);
    setFocusRequest((n) => n + 1);
  }, []);

  const clearEdited = useCallback((event: FormEvent<HTMLFormElement>) => {
    const name = (event.target as HTMLInputElement).name;
    setErrors((prev) => {
      if (!name || !(name in prev)) return prev;
      const next = { ...prev };
      delete next[name as keyof Errors];
      return next;
    });
  }, []);

  return { fieldErrors, setFieldErrors, clearEdited };
}
