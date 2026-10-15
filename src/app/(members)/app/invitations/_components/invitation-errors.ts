'use client';

import { useTranslations } from 'next-intl';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import type { ApiFailure } from '@/lib/api';

const CODES = [
  'EMAIL_QUOTA_EXHAUSTED',
  'EMAIL_PROVIDER_ERROR',
  'NO_EVENTS',
  'VALIDATION_ERROR',
] as const;

/** Email sending failures by `code`, falling back to the shared messages. */
export function useInvitationErrorMessage() {
  const t = useTranslations('members.invitations.errors');
  const fallback = useApiErrorMessage();
  return (failure: ApiFailure): string => {
    const code = CODES.find((known) => known === failure.code);
    return code ? t(code) : fallback(failure);
  };
}
