'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  CheckCircleIcon,
  CopyIcon,
  EyeIcon,
  LinkIcon,
  MailIcon,
  RefreshIcon,
} from '@/components/ui/icons';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import { postJson } from '@/lib/api';
import type { GuestDetailResponse } from '@/modules/guests/schemas';

type LinkGuest = Pick<
  GuestDetailResponse,
  'id' | 'name' | 'inviteUrl' | 'delivery' | 'linkOpenedAt'
>;

function formatInstant(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

/**
 * The guest's personal invitation link (PRD §9.9): copy it, see whether it was sent and opened,
 * and regenerate it (the old one stops working at once, API_DESIGN §14).
 */
export function InviteLinkCard({ guest: initial }: { guest: LinkGuest }) {
  const t = useTranslations('members.guests.link');
  const errorMessage = useApiErrorMessage();
  const router = useRouter();
  const [guest, setGuest] = useState(initial);
  const [copied, setCopied] = useState<'yes' | 'failed'>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [regenerated, setRegenerated] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(guest.inviteUrl);
      setCopied('yes');
    } catch {
      inputRef.current?.select();
      setCopied('failed');
    }
  }

  async function regenerate() {
    setPending(true);
    setError(undefined);
    const result = await postJson<GuestDetailResponse>(
      `/api/guests/${guest.id}/regenerate-link`,
      {},
    );
    setPending(false);
    dialogRef.current?.close();
    if (!result.ok) {
      setError(errorMessage(result));
      return;
    }
    setGuest(result.data);
    setCopied(undefined);
    setRegenerated(true);
    router.refresh();
  }

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-ink-accent">
          <LinkIcon width={18} height={18} />
        </span>
        <div>
          <h2 className="font-display text-headline-sm text-ink">{t('title')}</h2>
          <p className="mt-1 text-body text-ink-muted">{t('lead')}</p>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}
      {regenerated && (
        <p
          role="status"
          className="rounded-control bg-success-subtle px-3.5 py-2.5 text-body text-success"
        >
          {t('regenerated')}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="invite-url" className="sr-only">
          {t('label')}
        </label>
        <input
          ref={inputRef}
          id="invite-url"
          readOnly
          value={guest.inviteUrl}
          onFocus={(event) => event.target.select()}
          className="h-11 min-w-0 flex-1 rounded-control border border-line bg-canvas-muted px-3.5 text-body text-ink"
        />
        <Button onClick={copy}>
          <CopyIcon width={16} height={16} />
          {t('copy')}
        </Button>
      </div>
      <p role="status" className="-mt-2 min-h-5 text-label">
        {copied === 'yes' && (
          <span className="inline-flex items-center gap-1.5 font-medium text-success">
            <CheckCircleIcon width={14} height={14} />
            {t('copied')}
          </span>
        )}
        {copied === 'failed' && <span className="text-danger">{t('copyFailed')}</span>}
      </p>

      <ul className="flex flex-col gap-2">
        <li className="flex items-center gap-3 rounded-control bg-canvas-muted px-3.5 py-3">
          <MailIcon width={18} height={18} className="shrink-0 text-ink-accent" />
          <span className="flex-1 text-body text-ink">
            {guest.delivery ? t('sent') : t('notSent')}
          </span>
          {guest.delivery && (
            <span className="text-label text-ink-muted">
              {t('sentOn', { date: formatInstant(guest.delivery.sentAt) })}
            </span>
          )}
        </li>
        <li className="flex items-center gap-3 rounded-control bg-canvas-muted px-3.5 py-3">
          <EyeIcon width={18} height={18} className="shrink-0 text-ink-accent" />
          <span className="flex-1 text-body text-ink">
            {guest.linkOpenedAt ? t('opened') : t('notOpened')}
          </span>
          {guest.linkOpenedAt && (
            <span className="text-label text-ink-muted">
              {t('openedOn', { date: formatInstant(guest.linkOpenedAt) })}
            </span>
          )}
        </li>
      </ul>

      <div className="border-t border-line pt-4">
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className="inline-flex items-center gap-2 text-body font-medium text-ink-accent hover:underline"
        >
          <RefreshIcon width={16} height={16} />
          {t('regenerate')}
        </button>
        <p className="mt-1 text-label text-ink-muted">{t('regenerateNote')}</p>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="regenerate-title"
        className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-card bg-surface p-0 text-ink shadow-float backdrop:bg-ink/40"
      >
        <div className="flex flex-col gap-4 p-6 sm:p-8">
          <h2 id="regenerate-title" className="font-display text-headline-sm break-words text-ink">
            {t('regenerateTitle', { name: guest.name })}
          </h2>
          <p className="text-body-lg text-ink">{t('regenerateBody')}</p>
          <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => dialogRef.current?.close()}>
              {t('cancel')}
            </Button>
            <Button onClick={regenerate} disabled={pending}>
              {pending ? t('regenerating') : t('regenerateConfirm')}
            </Button>
          </div>
        </div>
      </dialog>
    </Card>
  );
}
