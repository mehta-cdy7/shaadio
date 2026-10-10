'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { describedBy, Field, inputClasses } from '@/components/ui/field';
import { postJson } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  INVITATION_DAYS,
  inviteMemberSchema,
  LABEL_MAX,
  ROLES,
  type Role,
  type SentMemberInvitation,
} from '@/modules/members/schemas';
import { useMemberErrorMessage } from './member-errors';

type FieldErrors = { email?: string; label?: string };

/** Email, role and relationship label (PRD §9.4, `POST /api/member-invitations`). */
export function InviteMemberForm({
  onSent,
  onCancel,
}: {
  onSent: (sent: SentMemberInvitation) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('members.settings.members');
  const errorMessage = useMemberErrorMessage();
  const [role, setRole] = useState<Role>('MANAGER');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = inviteMemberSchema.safeParse({
      email: data.get('email'),
      role,
      label: data.get('label'),
    });
    setError(undefined);
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'email') errors.email = t('dialog.emailInvalid');
        if (issue.path[0] === 'label') errors.label = t('dialog.labelTooLong', { max: LABEL_MAX });
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setPending(true);
    const result = await postJson<SentMemberInvitation>('/api/member-invitations', parsed.data);
    setPending(false);
    if (result.ok) onSent(result.data);
    else setError(errorMessage(result));
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
      <h2 id="invite-dialog-title" className="font-display text-headline-sm text-ink">
        {t('dialog.title')}
      </h2>
      {error && <Alert>{error}</Alert>}

      <Field id="invite-email" label={t('dialog.email')} error={fieldErrors.email}>
        <input
          id="invite-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          placeholder={t('dialog.emailPlaceholder')}
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={describedBy('invite-email', { error: fieldErrors.email })}
          className={inputClasses}
        />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-body font-medium text-ink">{t('dialog.role')}</legend>
        {ROLES.map((value) => (
          <label
            key={value}
            className={cn(
              'flex cursor-pointer gap-3 rounded-control border p-3.5 transition-colors',
              role === value ? 'border-primary bg-primary-subtle' : 'border-line bg-surface',
            )}
          >
            <input
              type="radio"
              name="role"
              value={value}
              checked={role === value}
              onChange={() => setRole(value)}
              className="mt-1 accent-primary"
            />
            <span className="flex flex-col">
              <span className="text-body font-semibold text-ink">{t(`roles.${value}`)}</span>
              <span className="text-label text-ink-muted">{t(`roleHelp.${value}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <Field
        id="invite-label"
        label={
          <>
            {t('dialog.label')}{' '}
            <span className="font-normal text-ink-muted">{t('dialog.labelOptional')}</span>
          </>
        }
        error={fieldErrors.label}
      >
        <input
          id="invite-label"
          name="label"
          type="text"
          maxLength={LABEL_MAX}
          placeholder={t('dialog.labelPlaceholder')}
          aria-invalid={fieldErrors.label ? true : undefined}
          aria-describedby={describedBy('invite-label', { error: fieldErrors.label })}
          className={inputClasses}
        />
      </Field>

      <p className="rounded-control bg-canvas-muted px-3.5 py-2.5 text-label text-ink-muted">
        {t('dialog.note', { days: INVITATION_DAYS })}
      </p>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onCancel}>
          {t('dialog.cancel')}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t('dialog.sending') : t('dialog.send')}
        </Button>
      </div>
    </form>
  );
}
