'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { describedBy, Field, inputClasses } from '@/components/ui/field';
import { ArrowRightIcon, LockIcon } from '@/components/ui/icons';
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
import { useJoinErrorMessage } from './join-errors';

type FieldName = 'name' | 'password';
type FieldErrors = Partial<Record<FieldName, ReactNode>>;

/**
 * Create an account and join in one request (API_DESIGN §10 `memberInviteToken`). The email is the
 * invited one and cannot be changed; if joining fails, no account is created.
 */
export function JoinSignupForm({ token, email }: { token: string; email: string }) {
  const t = useTranslations('auth.signUp');
  const tJoin = useTranslations('auth.join');
  const errorMessage = useApiErrorMessage();
  const joinError = useJoinErrorMessage();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<ReactNode>();
  const formRef = useRef<HTMLFormElement>(null);
  const { fieldErrors, setFieldErrors, clearEdited } = useFieldErrors<FieldErrors>(formRef);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = signupSchema.safeParse({
      name: data.get('name'),
      email,
      password: data.get('password'),
      memberInviteToken: token,
    });
    setFormError(undefined);
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'name' && !errors.name) {
          errors.name =
            issue.code === 'too_big' ? t('nameTooLong', { max: NAME_MAX }) : t('nameRequired');
        } else if (field === 'password' && !errors.password) {
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
      router.replace('/app');
      router.refresh();
      return;
    }
    setPending(false);
    if (result.code === 'EMAIL_TAKEN') {
      setFormError(
        <>
          {t('emailTaken')}{' '}
          <Link
            href={`/login?next=${encodeURIComponent(`/join/${token}`)}`}
            className="font-semibold underline"
          >
            {tJoin('logInToJoin')}
          </Link>
        </>,
      );
      return;
    }
    const serverFields = (result.details as { fields?: Record<string, unknown> } | undefined)
      ?.fields;
    if (result.code === 'VALIDATION_ERROR' && serverFields?.password) {
      setFieldErrors({ password: t('passwordCommon') });
      return;
    }
    setFormError(joinError(result) ?? errorMessage(result));
  }

  const passwordHint = t('passwordHint', { min: PASSWORD_MIN });

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={onSubmit}
      onInput={clearEdited}
      className="flex flex-col gap-5"
    >
      {formError && <Alert>{formError}</Alert>}
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

      <Field
        id="email"
        label={t('email')}
        action={<LockIcon width={14} height={14} className="text-ink-muted" aria-hidden="true" />}
        hint={tJoin('emailLocked')}
      >
        <input
          id="email"
          name="email"
          type="email"
          value={email}
          readOnly
          aria-describedby="email-hint"
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
        {pending ? tJoin('creating') : tJoin('createAndJoin')}
        {!pending && <ArrowRightIcon width={18} height={18} />}
      </Button>
    </form>
  );
}
