'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  ChatIcon,
  CheckCircleIcon,
  CopyIcon,
  ExternalLinkIcon,
  GlobeIcon,
} from '@/components/ui/icons';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import { postJson } from '@/lib/api';
import { whatsAppUrl } from '@/lib/whatsapp';
import type { WebsiteResponse } from '@/modules/weddings/schemas';

function formatInstant(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

/**
 * Publish state and sharing (PRD §9.18). Until published the link is a 404 for everyone, so it is
 * shown only once the site is live. Publishing and unpublishing are logged (DB §5.15).
 */
export function PublishCard({
  website: initial,
  couple,
}: {
  website: WebsiteResponse;
  couple: readonly [string, string];
}) {
  const t = useTranslations('members.website.publish');
  const errorMessage = useApiErrorMessage();
  const router = useRouter();
  const [website, setWebsite] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState<'yes' | 'failed'>();
  const inputRef = useRef<HTMLInputElement>(null);

  async function toggle() {
    setPending(true);
    setError(undefined);
    const result = await postJson<WebsiteResponse>(
      website.published ? '/api/website/unpublish' : '/api/website/publish',
      {},
    );
    setPending(false);
    if (!result.ok) {
      setError(errorMessage(result));
      return;
    }
    setWebsite(result.data);
    setCopied(undefined);
    router.refresh();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(website.url);
      setCopied('yes');
    } catch {
      inputRef.current?.select();
      setCopied('failed');
    }
  }

  const message = t('message', { first: couple[0], second: couple[1], url: website.url });

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-ink-accent">
            <GlobeIcon width={18} height={18} />
          </span>
          <div>
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-display text-headline-sm text-ink">{t('title')}</span>
              <Badge
                size="sm"
                tone={website.published ? 'success' : 'neutral'}
                dot={website.published}
              >
                {website.published ? t('published') : t('draft')}
              </Badge>
            </p>
            <p className="mt-1 text-body text-ink-muted">
              {website.published
                ? website.publishedAt
                  ? t('publishedOn', { date: formatInstant(website.publishedAt) })
                  : t('publishedNote')
                : t('draftNote')}
            </p>
          </div>
        </div>
        <Button
          variant={website.published ? 'outline' : 'primary'}
          onClick={toggle}
          disabled={pending}
          className="shrink-0"
        >
          {pending ? t('working') : website.published ? t('unpublish') : t('publishAction')}
        </Button>
      </div>

      {error && <Alert>{error}</Alert>}

      {website.published && (
        <div className="flex flex-col gap-3 border-t border-line pt-5">
          <label htmlFor="website-url" className="text-body font-medium text-ink">
            {t('linkLabel')}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              ref={inputRef}
              id="website-url"
              readOnly
              value={website.url}
              onFocus={(event) => event.target.select()}
              className="h-11 min-w-0 flex-1 rounded-control border border-line bg-canvas-muted px-3.5 text-body text-ink"
            />
            <Button variant="outline" onClick={copy}>
              <CopyIcon width={16} height={16} />
              {t('copy')}
            </Button>
          </div>
          <p role="status" className="min-h-5 text-label">
            {copied === 'yes' && (
              <span className="inline-flex items-center gap-1.5 font-medium text-success">
                <CheckCircleIcon width={14} height={14} />
                {t('copied')}
              </span>
            )}
            {copied === 'failed' && <span className="text-danger">{t('copyFailed')}</span>}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <a
              href={whatsAppUrl(undefined, message)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses()}
            >
              <ChatIcon width={18} height={18} />
              {t('whatsapp')}
            </a>
            <a
              href={website.url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses({ variant: 'outline' })}
            >
              <ExternalLinkIcon width={16} height={16} />
              {t('open')}
            </a>
          </div>
          <p className="text-label text-ink-muted">{t('unlistedNote')}</p>
        </div>
      )}
    </Card>
  );
}
