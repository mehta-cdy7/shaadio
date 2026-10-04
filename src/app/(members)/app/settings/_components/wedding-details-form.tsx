'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckCircleIcon, LinkIcon } from '@/components/ui/icons';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import { useFieldErrors } from '@/components/ui/use-field-errors';
import { useUnsavedChangesWarning } from '@/components/ui/use-unsaved-changes';
import { patchJson } from '@/lib/api';
import type { WeddingResponse } from '@/modules/weddings/schemas';
import {
  useCheckWeddingForm,
  WeddingFields,
  weddingFormValues,
  WeddingPreviewPanel,
  type WeddingFieldErrors,
  type WeddingFormValues,
} from '../../../_components/wedding-form';
import { weddingChanges } from './wedding-changes';

function sameValues(a: WeddingFormValues, b: WeddingFormValues): boolean {
  return (Object.keys(a) as Array<keyof WeddingFormValues>).every((key) => a[key] === b[key]);
}

/**
 * Settings → Wedding details (PRD §9.25, API_DESIGN §11 `PATCH /api/wedding`). A save sends only
 * the changed fields (`weddingChanges`); emptied optional fields go as `null` so they are cleared.
 * Save is enabled only when something changed, and "Saved" shows until the next edit.
 */
export function WeddingDetailsForm({ wedding }: { wedding: WeddingResponse }) {
  const t = useTranslations('members.settings.details');
  const tf = useTranslations('members.weddingForm');
  const errorMessage = useApiErrorMessage();
  const checkForm = useCheckWeddingForm();
  const router = useRouter();
  const [saved, setSaved] = useState(() => weddingFormValues(wedding));
  const [values, setValues] = useState(saved);
  const [pending, setPending] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [formError, setFormError] = useState<string>();
  const formRef = useRef<HTMLFormElement>(null);
  const { fieldErrors, setFieldErrors, clearEdited } = useFieldErrors<WeddingFieldErrors>(formRef);

  const dirty = !sameValues(values, saved);
  useUnsavedChangesWarning(dirty && !pending, t('unsavedWarning'));

  function edit(next: WeddingFormValues) {
    setValues(next);
    setJustSaved(false);
  }

  function discard() {
    setValues(saved);
    setFieldErrors({});
    setFormError(undefined);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    const checked = checkForm(values, saved.weddingDate);
    if (!checked.ok) {
      setFieldErrors(checked.errors);
      return;
    }

    const body = weddingChanges(saved, values, checked.data);

    setFieldErrors({});
    setPending(true);
    const result = await patchJson<WeddingResponse>('/api/wedding', body);
    setPending(false);
    if (result.ok) {
      const next = weddingFormValues(result.data);
      setSaved(next);
      setValues(next);
      setJustSaved(true);
      // The sidebar, header and dashboard show the names and date: re-render them.
      router.refresh();
      return;
    }
    const serverFields = (result.details as { fields?: Record<string, unknown> } | undefined)
      ?.fields;
    if (result.code === 'VALIDATION_ERROR' && serverFields?.weddingDate) {
      setFieldErrors({ weddingDate: tf('dateInPast') });
      return;
    }
    setFormError(errorMessage(result));
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex flex-col gap-5">
        <Card>
          <h2 className="font-display text-headline-md text-ink">{t('title')}</h2>
          <p className="mt-1 text-body-lg text-ink-muted">{t('lead')}</p>

          {formError && <Alert className="mt-6">{formError}</Alert>}

          <form
            ref={formRef}
            noValidate
            onSubmit={onSubmit}
            onInput={clearEdited}
            className="mt-7 flex flex-col gap-5"
          >
            <WeddingFields values={values} onChange={edit} fieldErrors={fieldErrors} />

            <div className="mt-3 flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:items-center">
              <p role="status" className="sm:mr-auto">
                {justSaved && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success-subtle px-3 py-1.5 text-label font-semibold text-success">
                    <CheckCircleIcon width={16} height={16} />
                    {t('saved')}
                  </span>
                )}
              </p>
              <Button variant="outline" onClick={discard} disabled={!dirty || pending}>
                {t('discard')}
              </Button>
              <Button type="submit" disabled={!dirty || pending}>
                {pending ? t('saving') : t('save')}
              </Button>
            </div>
          </form>
        </Card>

        <p className="flex items-start gap-3 rounded-card border border-line bg-canvas-muted px-5 py-4 text-body text-ink-muted">
          <LinkIcon width={18} height={18} className="mt-0.5 shrink-0 text-secondary-ink" />
          {t('slugNote')}
        </p>
      </div>

      <aside className="sticky top-8 hidden lg:block">
        <WeddingPreviewPanel values={values} />
      </aside>
    </div>
  );
}
