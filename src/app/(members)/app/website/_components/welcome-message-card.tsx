'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, textareaClasses } from '@/components/ui/field';
import { CheckCircleIcon } from '@/components/ui/icons';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import { useUnsavedChangesWarning } from '@/components/ui/use-unsaved-changes';
import { patchJson } from '@/lib/api';
import { WELCOME_MESSAGE_MAX, type WebsiteResponse } from '@/modules/weddings/schemas';

/** The website's welcome message (PRD §9.18). Emptying it removes it (`null`). */
export function WelcomeMessageCard({ initial }: { initial: string }) {
  const t = useTranslations('members.website.welcome');
  const errorMessage = useApiErrorMessage();
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [value, setValue] = useState(initial);
  const [pending, setPending] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string>();

  const dirty = value.trim() !== saved;
  useUnsavedChangesWarning(dirty && !pending, t('unsavedWarning'));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setPending(true);
    const result = await patchJson<WebsiteResponse>('/api/website', {
      welcomeMessage: value.trim() || null,
    });
    setPending(false);
    if (!result.ok) {
      setError(errorMessage(result));
      return;
    }
    const next = result.data.welcomeMessage ?? '';
    setSaved(next);
    setValue(next);
    setJustSaved(true);
    router.refresh();
  }

  const hint = t('hint', { count: value.length, max: WELCOME_MESSAGE_MAX });

  return (
    <Card>
      <h2 className="font-display text-headline-sm text-ink">{t('title')}</h2>
      <p className="mt-1 text-body text-ink-muted">{t('lead')}</p>
      {error && <Alert className="mt-5">{error}</Alert>}
      <form noValidate onSubmit={onSubmit} className="mt-5 flex flex-col gap-4">
        <Field id="welcomeMessage" label={t('label')} hint={hint}>
          <textarea
            id="welcomeMessage"
            name="welcomeMessage"
            value={value}
            maxLength={WELCOME_MESSAGE_MAX}
            placeholder={t('placeholder')}
            onChange={(event) => {
              setValue(event.target.value);
              setJustSaved(false);
            }}
            aria-describedby="welcomeMessage-hint"
            className={textareaClasses}
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
          <Button type="submit" disabled={!dirty || pending}>
            {pending ? t('saving') : t('save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
