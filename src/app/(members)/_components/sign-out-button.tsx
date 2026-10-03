'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button, type ButtonStyleProps } from '@/components/ui/button';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import { postJson } from '@/lib/api';

/** Ends the session (API_DESIGN §10 `POST /api/auth/logout`) and returns to sign-in. */
export function SignOutButton({ variant = 'outline' }: { variant?: ButtonStyleProps['variant'] }) {
  const t = useTranslations('members.signOut');
  const errorMessage = useApiErrorMessage();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function signOut() {
    setPending(true);
    setError(undefined);
    const result = await postJson<void>('/api/auth/logout', {});
    if (!result.ok) {
      setPending(false);
      setError(errorMessage(result));
      return;
    }
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant={variant} onClick={signOut} disabled={pending}>
        {pending ? t('pending') : t('label')}
      </Button>
      {error && (
        <p role="alert" className="text-label text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
