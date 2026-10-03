'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { describedBy, Field, inputClasses } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/password-input';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import { useFieldErrors } from '@/components/ui/use-field-errors';
import { postJson } from '@/lib/api';
import {
  NAME_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  signupSchema,
  type MeResponse,
} from '@/modules/auth/schemas';
import { afterSignInPath } from './after-sign-in';

type FieldName = 'name' | 'email' | 'password';
type FieldErrors = Partial<Record<FieldName, ReactNode>>;

/** Name, email and password sign-up (PRD §9.1, API_DESIGN §10 `POST /api/auth/signup`). */
export function SignupForm() {
  const t = useTranslations('auth.signUp');
  const errorMessage = useApiErrorMessage();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string>();
  const formRef = useRef<HTMLFormElement>(null);
  const { fieldErrors, setFieldErrors, clearEdited } = useFieldErrors<FieldErrors>(formRef);

  // Shown for EMAIL_TAKEN: the most likely fix is signing in, so offer it right there.
  const emailTaken = (
    <>
      {t('emailTaken')}{' '}
      <Link href="/login" className="font-semibold text-ink-accent underline">
        {t('signInInstead')}
      </Link>
    </>
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = signupSchema.safeParse({
      name: data.get('name'),
      email: data.get('email'),
      password: data.get('password'),
    });

    setFormError(undefined);
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as FieldName;
        if (errors[field]) continue;
        if (field === 'name') {
          errors.name =
            issue.code === 'too_big' ? t('nameTooLong', { max: NAME_MAX }) : t('nameRequired');
        } else if (field === 'email') {
          errors.email = t('emailInvalid');
        } else if (field === 'password') {
          errors.password =
            issue.code === 'too_big'
              ? t('passwordTooLong', { max: PASSWORD_MAX })
              : t('passwordTooShort', { min: PASSWORD_MIN });
        }
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setPending(true);
    const result = await postJson<MeResponse>('/api/auth/signup', parsed.data);
    if (result.ok) {
      // Stays pending while the next page loads, so the button can't be pressed twice.
      router.replace(afterSignInPath(result.data));
      router.refresh();
      return;
    }

    setPending(false);
    if (result.code === 'EMAIL_TAKEN') {
      setFieldErrors({ email: emailTaken });
      return;
    }
    // The client checks match the schema, so a server field error here is a rule only the server
    // knows: today that is the common-password list (API_DESIGN §10).
    const serverFields = (result.details as { fields?: Record<string, unknown> } | undefined)
      ?.fields;
    if (result.code === 'VALIDATION_ERROR' && serverFields?.password) {
      setFieldErrors({ password: t('passwordCommon') });
      return;
    }
    setFormError(errorMessage(result));
  }

  const passwordHint = t('passwordHint', { min: PASSWORD_MIN });

  return (
    <div className="flex flex-col gap-8">
      {formError && <Alert>{formError}</Alert>}

      <div className="flex flex-col items-start gap-3">
        <Badge tone="plain" size="sm" dot className="border border-secondary/60">
          {t('badge')}
        </Badge>
        <h1 className="font-display text-headline-lg-sm font-normal text-balance text-ink md:text-headline-lg">
          {t('title')}
        </h1>
        <p className="text-body-lg text-ink-muted">{t('lead')}</p>
      </div>

      <form
        ref={formRef}
        noValidate
        onSubmit={onSubmit}
        onInput={clearEdited}
        className="flex flex-col gap-5"
      >
        <Field id="name" label={t('name')} error={fieldErrors.name}>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={NAME_MAX}
            placeholder={t('namePlaceholder')}
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={describedBy('name', { error: fieldErrors.name })}
            className={inputClasses}
          />
        </Field>

        <Field id="email" label={t('email')} error={fieldErrors.email}>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            placeholder={t('emailPlaceholder')}
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={describedBy('email', { error: fieldErrors.email })}
            className={inputClasses}
          />
        </Field>

        <Field id="password" label={t('password')} hint={passwordHint} error={fieldErrors.password}>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN}
            placeholder={t('passwordPlaceholder')}
            showLabel={t('showPassword')}
            hideLabel={t('hidePassword')}
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={describedBy('password', {
              hint: passwordHint,
              error: fieldErrors.password,
            })}
          />
        </Field>

        <Button type="submit" size="lg" disabled={pending} className="mt-2 w-full">
          {pending ? t('submitting') : t('submit')}
        </Button>
      </form>

      <p className="text-center text-body text-ink-muted">
        {t('haveAccount')}{' '}
        <Link href="/login" className="font-medium text-ink-accent hover:underline">
          {t('signIn')}
        </Link>
      </p>
    </div>
  );
}
