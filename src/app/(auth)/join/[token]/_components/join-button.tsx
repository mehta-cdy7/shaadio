'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { UsersIcon } from '@/components/ui/icons';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import { postJson } from '@/lib/api';
import type { MeResponse } from '@/modules/auth/schemas';
import { useJoinErrorMessage } from './join-errors';

/** A signed-in user without a wedding accepts (API_DESIGN §12 `POST /api/member-invitations/accept`). */
export function JoinButton({ token }: { token: string }) {
  const t = useTranslations('auth.join');
  const errorMessage = useApiErrorMessage();
  const joinError = useJoinErrorMessage();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function join() {
    setPending(true);
    setError(undefined);
    const result = await postJson<MeResponse>('/api/member-invitations/accept', { token });
    if (result.ok) {
      router.replace('/app');
      router.refresh();
      return;
    }
    setPending(false);
    setError(joinError(result) ?? errorMessage(result));
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert>{error}</Alert>}
      <Button size="lg" onClick={join} disabled={pending} className="w-full">
        <UsersIcon width={18} height={18} />
        {pending ? t('joining') : t('joinWedding')}
      </Button>
    </div>
  );
}
