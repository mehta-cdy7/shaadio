'use client';

import { useTranslations } from 'next-intl';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import type { ApiFailure } from '@/lib/api';

const MEMBER_CODES = [
  'ALREADY_MEMBER',
  'INVITATION_PENDING',
  'LIMIT_REACHED',
  'LAST_ADMIN',
  'NOT_FOUND',
] as const;

/** Member and invitation failures by `code`, falling back to the shared messages. */
export function useMemberErrorMessage() {
  const t = useTranslations('members.settings.members.errors');
  const fallback = useApiErrorMessage();
  return (failure: ApiFailure): string => {
    const code = MEMBER_CODES.find((known) => known === failure.code);
    if (code === 'LIMIT_REACHED') {
      const limit = (failure.details as { limit?: unknown } | undefined)?.limit;
      return t('LIMIT_REACHED', { limit: typeof limit === 'number' ? limit : 25 });
    }
    return code ? t(code) : fallback(failure);
  };
}
