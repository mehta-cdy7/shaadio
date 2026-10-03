'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { describedBy, Field, inputClasses } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/password-input';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import { useFocusFirstInvalid } from '@/components/ui/use-focus-first-invalid';
import { postJson } from '@/lib/api';
import { loginSchema, PASSWORD_MAX, type MeResponse } from '@/modules/auth/schemas';
import { afterSignInPath } from './after-sign-in';

type FieldErrors = { email?: string; password?: string };

/** Email + password sign-in (PRD §9.1, API_DESIGN §10 `POST /api/auth/login`). */
export function LoginForm() {
  const t = useTranslations('auth.signIn');
  const errorMessage = useApiErrorMessage();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstInvalid(formRef, fieldErrors);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = loginSchema.safeParse({
      email: data.get('email'),
      password: data.get('password'),
    });

    // Field checks run here first so most mistakes never reach the server. The server's own
    // VALIDATION_ERROR still shows a message through the generic path below.
    if (!parsed.success) {
      const issueFor = (field: string) => parsed.error.issues.find((i) => i.path[0] === field);
      const passwordIssue = issueFor('password');
      setFieldErrors({
        ...(issueFor('email') && { email: t('emailInvalid') }),
        ...(passwordIssue && {
          password:
            passwordIssue.code === 'too_big'
              ? t('passwordTooLong', { max: PASSWORD_MAX })
              : t('passwordRequired'),
        }),
      });
      setFormError(undefined);
      return;
    }

    setFieldErrors({});
    setFormError(undefined);
    setPending(true);
    const result = await postJson<MeResponse>('/api/auth/login', parsed.data);
    if (!result.ok) {
      setPending(false);
      setFormError(errorMessage(result));
      if (result.code === 'INVALID_CREDENTIALS') {
        // Keep the email (the usual mistake is the password) and put the cursor back for a retry.
        const password = formRef.current?.elements.namedItem('password');
        if (password instanceof HTMLInputElement) {
          password.value = '';
          password.focus();
        }
      }
      return;
    }
    // Stays pending while the next page loads, so the button can't be pressed twice.
    router.replace(afterSignInPath(result.data));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      {formError && <Alert>{formError}</Alert>}

      <div className="flex flex-col gap-2">
        <h1 className="font-display text-headline-lg-sm font-normal text-ink md:text-headline-lg">
          {t('title')}
        </h1>
        <p className="text-body-lg text-ink-muted">{t('lead')}</p>
      </div>

      <form ref={formRef} noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
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

        <Field id="password" label={t('password')} error={fieldErrors.password}>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
            placeholder={t('passwordPlaceholder')}
            showLabel={t('showPassword')}
            hideLabel={t('hidePassword')}
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={describedBy('password', { error: fieldErrors.password })}
          />
        </Field>

        <Button type="submit" size="lg" disabled={pending} className="mt-2 w-full">
          {pending ? t('submitting') : t('submit')}
        </Button>
      </form>

      <p className="text-center text-body text-ink-muted">
        {t('noAccount')}{' '}
        <Link href="/signup" className="font-medium text-ink-accent hover:underline">
          {t('createAccount')}
        </Link>
      </p>
    </div>
  );
}
