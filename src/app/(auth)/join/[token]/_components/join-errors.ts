'use client';

import { useTranslations } from 'next-intl';
import type { ApiFailure } from '@/lib/api';

const JOIN_CODES = [
  'INVITATION_EXPIRED',
  'INVITE_EMAIL_MISMATCH',
  'NOT_FOUND',
  'ALREADY_MEMBER',
] as const;

/** Joining failures by `code`, or undefined for the shared messages to handle. */
export function useJoinErrorMessage() {
  const t = useTranslations('auth.join.errors');
  return (failure: ApiFailure): string | undefined => {
    const code = JOIN_CODES.find((known) => known === failure.code);
    return code ? t(code) : undefined;
  };
}
