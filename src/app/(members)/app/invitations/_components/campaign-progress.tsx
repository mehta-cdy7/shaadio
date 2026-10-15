'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CheckIcon, RefreshIcon } from '@/components/ui/icons';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import { postJson } from '@/lib/api';
import type { Campaign } from '@/modules/invitations/schemas';

function formatInstant(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(iso));
}

/** Queued email progress, newest first (API_DESIGN §16): "queued" until a job is really sent. */
export function CampaignProgress({ campaigns }: { campaigns: Campaign[] }) {
  const t = useTranslations('members.invitations.progress');
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-display text-headline-sm text-ink">{t('title')}</h2>
      {campaigns.length === 0 ? (
        <p className="rounded-control bg-canvas-muted px-4 py-5 text-center text-body text-ink-muted">
          {t('empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {campaigns.slice(0, 5).map((campaign) => (
            <CampaignRow key={campaign.id} campaign={campaign} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function CampaignRow({ campaign }: { campaign: Campaign }) {
  const t = useTranslations('members.invitations.progress');
  const errorMessage = useApiErrorMessage();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const { counts } = campaign;
  const waiting = counts.pending + counts.processing;
  const total = waiting + counts.sent + counts.failed + counts.cancelled;
  const width = (part: number) => `${total ? (part / total) * 100 : 0}%`;

  async function retry() {
    setPending(true);
    setError(undefined);
    const result = await postJson<Campaign>(`/api/email-campaigns/${campaign.id}/retry-failed`, {});
    setPending(false);
    if (result.ok) router.refresh();
    else setError(errorMessage(result));
  }

  return (
    <li className="flex flex-col gap-2 rounded-control border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-body text-ink-muted">
          <Badge size="sm" tone="neutral">
            {t(`kind.${campaign.kind}`)}
          </Badge>
          {t('startedBy', {
            name: campaign.createdBy.name,
            date: formatInstant(campaign.createdAt),
          })}
        </p>
        {waiting === 0 && counts.failed === 0 && (
          <Badge size="sm" tone="success">
            <CheckIcon width={12} height={12} />
            {t('done', { count: counts.sent })}
          </Badge>
        )}
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-fill" aria-hidden>
        <span className="bg-success" style={{ width: width(counts.sent) }} />
        <span className="bg-danger" style={{ width: width(counts.failed) }} />
        <span className="bg-secondary" style={{ width: width(waiting) }} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-label text-ink-muted">
        <span>
          {t('counts', { queued: waiting, sent: counts.sent })}
          {counts.failed > 0 && (
            <span className="text-danger"> · {t('failedCount', { count: counts.failed })}</span>
          )}
          {counts.cancelled > 0 && (
            <span> · {t('cancelledCount', { count: counts.cancelled })}</span>
          )}
        </span>
        {waiting > 0 && <span>{t('daysLeft', { days: campaign.estimatedDaysRemaining })}</span>}
        {counts.failed > 0 && (
          <button
            type="button"
            onClick={retry}
            disabled={pending}
            className="inline-flex items-center gap-1 font-semibold text-ink-accent hover:underline disabled:opacity-50"
          >
            <RefreshIcon width={14} height={14} />
            {pending ? t('retrying') : t('retry')}
          </button>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
    </li>
  );
}
