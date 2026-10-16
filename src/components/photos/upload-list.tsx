'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { AlertIcon, CheckCircleIcon, RefreshIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import type { UploadItem } from './use-photo-uploader';

/** Errors a retry cannot fix: the file itself is the problem, or a limit was reached. */
const FINAL = new Set(['VIDEO', 'NOT_AN_IMAGE', 'TOO_BIG', 'UNREADABLE', 'UPLOADS_DISABLED']);

/**
 * Per-photo progress for an upload (PRD §9.22 step 5), shared by members and guests: a thumbnail,
 * a progress bar, then "Uploaded" or the reason it failed, with Retry for each failed photo.
 */
export function UploadList({
  items,
  onRetry,
  onClear,
}: {
  items: UploadItem[];
  onRetry: (key: string) => void;
  onClear: () => void;
}) {
  const t = useTranslations('photoUpload');
  if (!items.length) return null;
  const active = items.some((item) => item.status !== 'done' && item.status !== 'failed');
  const done = items.filter((item) => item.status === 'done').length;
  const failed = items.filter((item) => item.status === 'failed').length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body text-ink" aria-live="polite">
          {t('summary', { done, total: items.length, failed })}
        </p>
        {!active && (
          <Button variant="ghost" onClick={onClear}>
            {t('clear')}
          </Button>
        )}
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-control border border-line bg-surface">
        {items.map((item) => (
          <UploadRow key={item.key} item={item} onRetry={() => onRetry(item.key)} />
        ))}
      </ul>
    </div>
  );
}

function UploadRow({ item, onRetry }: { item: UploadItem; onRetry: () => void }) {
  const t = useTranslations('photoUpload');
  const failed = item.status === 'failed';
  const retryable = failed && !FINAL.has(item.error ?? '');

  return (
    <li className="flex items-center gap-3 p-3">
      <span className="size-11 shrink-0 overflow-hidden rounded-control bg-fill">
        {item.previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.previewUrl} alt="" className="size-full object-cover" />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-body text-ink">{item.name}</p>
        {failed ? (
          <p className="flex items-start gap-1.5 text-label text-danger">
            <AlertIcon width={14} height={14} className="mt-0.5 shrink-0" />
            {errorFor(t, item)}
          </p>
        ) : item.status === 'done' ? (
          <p className="flex items-center gap-1.5 text-label text-success">
            <CheckCircleIcon width={14} height={14} />
            {t('status.done')}
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fill">
              <div
                className={cn(
                  'h-full rounded-full bg-primary transition-[width]',
                  item.status === 'preparing' && 'animate-pulse',
                )}
                style={{
                  width: `${Math.round((item.status === 'preparing' ? 0.05 : item.progress) * 100)}%`,
                }}
              />
            </div>
            <span className="text-label text-ink-muted">
              {t(`status.${item.status as 'preparing' | 'uploading' | 'finishing'}`)}
            </span>
          </div>
        )}
      </div>
      {retryable && (
        <Button variant="outline" onClick={onRetry} className="shrink-0">
          <RefreshIcon width={16} height={16} />
          {t('retry')}
        </Button>
      )}
    </li>
  );
}

type Translate = ReturnType<typeof useTranslations<'photoUpload'>>;

function errorFor(t: Translate, item: UploadItem): string {
  switch (item.error) {
    case 'VIDEO':
    case 'NOT_AN_IMAGE':
    case 'TOO_BIG':
    case 'UNREADABLE':
    case 'MISSING_OBJECT':
    case 'EXPIRED':
    case 'UPLOAD_FAILED':
    case 'NETWORK_ERROR':
    case 'UPLOADS_DISABLED':
      return t(`errors.${item.error}`);
    case 'TOO_LARGE':
      return t('errors.UPLOAD_FAILED');
    case 'GALLERY_FULL':
      return t('errors.GALLERY_FULL', { remaining: item.remaining ?? 0 });
    case 'RATE_LIMITED':
      return t('errors.RATE_LIMITED', { remaining: item.remaining ?? 0 });
    default:
      return t('errors.generic');
  }
}
