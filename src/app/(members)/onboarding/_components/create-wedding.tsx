'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/typography';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import { useFieldErrors } from '@/components/ui/use-field-errors';
import { getJson, postJson } from '@/lib/api';
import type { MeResponse } from '@/modules/auth/schemas';
import type { WeddingResponse } from '@/modules/weddings/schemas';
import {
  EMPTY_WEDDING_FORM,
  useCheckWeddingForm,
  WeddingFields,
  WeddingPreviewPanel,
  type WeddingFieldErrors,
} from '../../_components/wedding-form';

/**
 * "Create your wedding" (PRD §9.2, API_DESIGN §11 `POST /api/wedding`): the form on the left and a
 * live preview of the couple's card on the right; on phones the preview sits above the form.
 * `header` and `footer` are rendered by the server page.
 */
export function CreateWedding({ header, footer }: { header: ReactNode; footer: ReactNode }) {
  const t = useTranslations('members.onboarding');
  const tf = useTranslations('members.weddingForm');
  const errorMessage = useApiErrorMessage();
  const checkForm = useCheckWeddingForm();
  const router = useRouter();
  const [values, setValues] = useState(EMPTY_WEDDING_FORM);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string>();
  const formRef = useRef<HTMLFormElement>(null);
  const { fieldErrors, setFieldErrors, clearEdited } = useFieldErrors<WeddingFieldErrors>(formRef);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    const checked = checkForm(values);
    if (!checked.ok) {
      setFieldErrors(checked.errors);
      return;
    }

    setFieldErrors({});
    setPending(true);
    const result = await postJson<WeddingResponse>('/api/wedding', checked.data);
    // ALREADY_MEMBER usually means the wedding was created in another tab: go to it. But a
    // membership can outlive its wedding (one being deleted, DATABASE_DESIGN §14.8), and /app would
    // send the user straight back here, so only go when /api/me confirms an active wedding.
    const hasWedding =
      result.ok ||
      (result.code === 'ALREADY_MEMBER' &&
        (await getJson<MeResponse>('/api/me').then((me) => me.ok && Boolean(me.data.wedding))));
    if (hasWedding) {
      // Stays pending while the workspace loads, so the button can't be pressed twice.
      router.replace('/app');
      router.refresh();
      return;
    }
    setPending(false);
    // The client check passed, so a server date error means the two clocks disagree about today.
    const serverFields = (result.details as { fields?: Record<string, unknown> } | undefined)
      ?.fields;
    if (result.code === 'VALIDATION_ERROR' && serverFields?.weddingDate) {
      setFieldErrors({ weddingDate: tf('dateInPast') });
      return;
    }
    setFormError(errorMessage(result));
  }

  const preview = <WeddingPreviewPanel values={values} />;

  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-2">
      <div className="flex flex-col px-4 py-8 sm:px-14 lg:px-20 lg:py-12">
        {header}
        <main className="mx-auto w-full max-w-130 py-10">
          <div className="flex flex-col gap-3">
            <Eyebrow>
              {t('step')} <span aria-hidden="true">·</span> {t('stepLabel')}
            </Eyebrow>
            <h1 className="font-display text-headline-lg-sm font-normal text-balance text-ink md:text-headline-lg">
              {t('title')}
            </h1>
            <p className="text-body-lg text-ink-muted">{t('lead')}</p>
          </div>

          <div className="mt-8 lg:hidden">{preview}</div>

          {formError && <Alert className="mt-8">{formError}</Alert>}

          <form
            ref={formRef}
            noValidate
            onSubmit={onSubmit}
            onInput={clearEdited}
            className="mt-8 flex flex-col gap-5"
          >
            <WeddingFields values={values} onChange={setValues} fieldErrors={fieldErrors} />
            <Button type="submit" size="lg" disabled={pending} className="mt-3 w-full">
              {pending ? t('submitting') : t('submit')}
            </Button>
          </form>

          <p className="mt-6 rounded-control bg-fill px-4 py-3 text-center text-body text-ink-muted">
            {t('invited')} <span className="text-ink">{t('invitedBody')}</span>
          </p>
        </main>
        {footer}
      </div>
      <aside className="hidden border-l border-secondary bg-panel lg:block">
        <div className="sticky top-0 flex h-dvh items-center justify-center p-16">
          <div className="w-full max-w-110">{preview}</div>
        </div>
      </aside>
    </div>
  );
}
