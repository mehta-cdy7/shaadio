'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { describedBy, Field, inputClasses } from '@/components/ui/field';
import { CheckCircleIcon } from '@/components/ui/icons';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import { useUnsavedChangesWarning } from '@/components/ui/use-unsaved-changes';
import { patchJson } from '@/lib/api';
import { todayIn } from '@/lib/dates';
import type { WeddingResponse } from '@/modules/weddings/schemas';

/**
 * Settings → RSVP deadline (PRD §9.11): optional and wedding-wide. After it, guests see their last
 * answer read-only; members can still edit RSVPs. Emptying the field clears it (`null`).
 */
export function RsvpDeadlineCard({
  wedding,
}: {
  wedding: Pick<WeddingResponse, 'rsvpDeadline' | 'rsvpLocked' | 'weddingDate' | 'timezone'>;
}) {
  const t = useTranslations('members.settings.deadline');
  const errorMessage = useApiErrorMessage();
  const router = useRouter();
  const [saved, setSaved] = useState(wedding.rsvpDeadline ?? '');
  const [value, setValue] = useState(saved);
  const [locked, setLocked] = useState(wedding.rsvpLocked);
  const [pending, setPending] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<string>();

  const dirty = value !== saved;
  useUnsavedChangesWarning(dirty && !pending, t('unsavedWarning'));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setFieldError(undefined);
    // PRD §9.11: today or later, on or before the wedding date. The server checks again.
    if (value && value < todayIn(wedding.timezone)) {
      setFieldError(t('inPast'));
      return;
    }
    if (value && value > wedding.weddingDate) {
      setFieldError(t('afterWedding'));
      return;
    }
    setPending(true);
    const result = await patchJson<WeddingResponse>('/api/wedding', {
      rsvpDeadline: value || null,
    });
    setPending(false);
    if (result.ok) {
      const next = result.data.rsvpDeadline ?? '';
      setSaved(next);
      setValue(next);
      setLocked(result.data.rsvpLocked);
      setJustSaved(true);
      router.refresh();
      return;
    }
    if (result.code === 'VALIDATION_ERROR') setFieldError(t('invalid'));
    else setError(errorMessage(result));
  }

  const hint = locked ? t('lockedHint') : t('hint');

  return (
    <Card>
      <h2 className="font-display text-headline-sm text-ink">{t('title')}</h2>
      <p className="mt-1 text-body text-ink-muted">{t('lead')}</p>
      {error && <Alert className="mt-5">{error}</Alert>}
      <form noValidate onSubmit={onSubmit} className="mt-5 flex flex-col gap-5">
        <Field id="rsvpDeadline" label={t('label')} hint={hint} error={fieldError}>
          <input
            id="rsvpDeadline"
            name="rsvpDeadline"
            type="date"
            value={value}
            min={todayIn(wedding.timezone)}
            max={wedding.weddingDate}
            onChange={(event) => {
              setValue(event.target.value);
              setJustSaved(false);
              setFieldError(undefined);
            }}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={describedBy('rsvpDeadline', { hint, error: fieldError })}
            className={`${inputClasses} sm:w-64`}
          />
        </Field>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
          <p role="status" className="sm:mr-auto">
            {justSaved && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-subtle px-3 py-1.5 text-label font-semibold text-success">
                <CheckCircleIcon width={16} height={16} />
                {t('saved')}
              </span>
            )}
          </p>
          {saved && (
            <Button variant="outline" onClick={() => setValue('')} disabled={pending || !value}>
              {t('clear')}
            </Button>
          )}
          <Button type="submit" disabled={!dirty || pending}>
            {pending ? t('saving') : t('save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
