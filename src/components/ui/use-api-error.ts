'use client';

import { useTranslations } from 'next-intl';
import { NETWORK_ERROR, retryAfterMinutes, type ApiFailure } from '@/lib/api';

/**
 * Turns a failed API call into user-facing text from messages/en.json (`errors.*`), by `code`.
 * Every failure shows something: codes without their own text fall back to a generic message plus
 * the request id, so a family member can quote it when reporting a problem.
 */
export function useApiErrorMessage() {
  const t = useTranslations('errors');

  return (failure: ApiFailure): string => {
    if (failure.code === 'RATE_LIMITED') {
      return t('RATE_LIMITED', { minutes: retryAfterMinutes(failure.details) });
    }
    if (failure.code === NETWORK_ERROR || failure.code === 'INVALID_CREDENTIALS') {
      return t(failure.code);
    }
    return failure.requestId
      ? t('genericWithReference', { requestId: failure.requestId })
      : t('generic');
  };
}
