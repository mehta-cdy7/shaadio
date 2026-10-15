'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckCircleIcon, MailIcon } from '@/components/ui/icons';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import { postJson } from '@/lib/api';
import type { CreatedCampaign } from '@/modules/invitations/schemas';

/**
 * Queue the invitation emails (API_DESIGN §16). The confirmation is honest about the daily limit:
 * emails are queued and go out once a day, so the UI never says "sent" here.
 */
export function EmailInvitationsCard({
  ready,
  queued,
  perDay,
}: {
  ready: number;
  queued: number;
  perDay: number;
}) {
  const t = useTranslations('members.invitations.email');
  const errorMessage = useApiErrorMessage();
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();

  // A refresh brings new numbers; an old error no longer applies to them.
  const [seenReady, setSeenReady] = useState(ready);
  if (seenReady !== ready) {
    setSeenReady(ready);
    setError(undefined);
  }

  async function queue() {
    setPending(true);
    setError(undefined);
    const result = await postJson<CreatedCampaign>('/api/email-campaigns', {
      kind: 'GUEST_INVITATION',
    });
    setPending(false);
    dialogRef.current?.close();
    if (result.ok) {
      const count = result.data.campaign.counts.pending;
      setDone(t('queued', { count, days: Math.max(1, Math.ceil(count / perDay)) }));
      router.refresh();
      return;
    }
    const reason = (result.details as { reason?: unknown } | undefined)?.reason;
    setError(reason === 'NOTHING_TO_SEND' ? t('nothingToSend') : errorMessage(result));
    if (reason === 'NOTHING_TO_SEND') router.refresh();
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-3 font-display text-headline-sm text-ink">
          <span className="flex size-10 items-center justify-center rounded-control bg-primary-subtle text-ink-accent">
            <MailIcon width={18} height={18} />
          </span>
          {t('title')}
        </h2>
        {ready > 0 && (
          <Badge size="sm" tone="neutral">
            {ready}
          </Badge>
        )}
      </div>
      <p className="text-body text-ink-muted">
        {ready > 0
          ? t('ready', { count: ready })
          : queued > 0
            ? t('allQueued', { count: queued })
            : t('none')}
      </p>
      {error && <Alert>{error}</Alert>}
      {done && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-control bg-success-subtle px-3.5 py-2.5 text-body text-success"
        >
          <CheckCircleIcon width={18} height={18} className="mt-0.5 shrink-0" />
          {done}
        </p>
      )}
      <div className="mt-auto flex flex-col gap-2 border-t border-line pt-4">
        {ready > 0 && (
          <Button
            onClick={() => {
              setError(undefined);
              setDone(undefined);
              dialogRef.current?.showModal();
            }}
            disabled={ready === 0}
          >
            <MailIcon width={16} height={16} />
            {t('queue', { count: ready })}
          </Button>
        )}
        <p className="text-center text-label text-ink-muted">{t('whatsappHint')}</p>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="queue-title"
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-card bg-surface p-0 text-ink shadow-float backdrop:bg-ink/40"
      >
        <div className="flex flex-col gap-4 p-6 sm:p-8">
          <h2 id="queue-title" className="font-display text-headline-sm text-ink">
            {t('dialogTitle')}
          </h2>
          <p className="text-body-lg text-ink">
            {t('dialogBody', { count: ready, days: Math.max(1, Math.ceil(ready / perDay)) })}
          </p>
          <p className="rounded-control bg-pending px-3.5 py-2.5 text-body text-on-pending">
            {t('dialogNote')}
          </p>
          <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => dialogRef.current?.close()}>
              {t('cancel')}
            </Button>
            <Button onClick={queue} disabled={pending}>
              {pending ? t('queueing') : t('confirm')}
            </Button>
          </div>
        </div>
      </dialog>
    </Card>
  );
}
