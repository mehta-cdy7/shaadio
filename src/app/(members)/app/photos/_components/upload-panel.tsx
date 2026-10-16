'use client';

import { useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePhotoUploader, type UploadItem } from '@/components/photos/use-photo-uploader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, inputClasses } from '@/components/ui/field';
import {
  AlertIcon,
  CheckCircleIcon,
  CloseIcon,
  RefreshIcon,
  UploadIcon,
} from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { PHOTOS_PER_REQUEST, type Photo } from '@/modules/gallery/schemas';
import type { EventName } from './photo-gallery';

/**
 * Upload (PRD §9.22, member side): choose the album, pick photos, watch each one's progress, and
 * retry any that failed. Each photo is resized in the browser first; originals are not kept.
 */
export function UploadPanel({
  events,
  defaultEventId,
  onPublished,
  onClose,
}: {
  events: EventName[];
  defaultEventId?: string;
  onPublished: (photo: Photo) => void;
  onClose: () => void;
}) {
  const t = useTranslations('members.photos.upload');
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [eventId, setEventId] = useState(defaultEventId ?? '');
  const { items, add, retry, clearFinished } = usePhotoUploader({
    base: '/api/photos',
    onPublished,
  });

  const active = items.some((item) => item.status !== 'done' && item.status !== 'failed');
  const done = items.filter((item) => item.status === 'done').length;
  const failed = items.filter((item) => item.status === 'failed').length;

  function choose(files: FileList | null) {
    if (!files?.length) return;
    add([...files], eventId || undefined);
    if (input.current) input.current.value = '';
  }

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-headline-sm text-ink">{t('title')}</h2>
          <p className="mt-1 text-body text-ink-muted">{t('lead', { max: PHOTOS_PER_REQUEST })}</p>
        </div>
        {!active && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-control p-2 text-ink-muted hover:bg-fill hover:text-ink"
            aria-label={t('close')}
          >
            <CloseIcon width={20} height={20} />
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field id={`${id}-album`} label={t('album')} hint={t('albumHint')}>
          <select
            id={`${id}-album`}
            value={eventId}
            onChange={(event) => setEventId(event.target.value)}
            className={inputClasses}
          >
            <option value="">{t('other')}</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </Field>
        <Button size="lg" onClick={() => input.current?.click()}>
          <UploadIcon width={18} height={18} />
          {t('choose')}
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          hidden
          onChange={(event) => choose(event.target.files)}
        />
      </div>

      <p className="rounded-control bg-canvas-muted p-3 text-label text-ink-muted">{t('note')}</p>

      {items.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-body text-ink" aria-live="polite">
              {t('summary', { done, total: items.length, failed })}
            </p>
            {!active && (
              <Button variant="ghost" onClick={clearFinished}>
                {t('clear')}
              </Button>
            )}
          </div>
          <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
            {items.map((item) => (
              <UploadRow key={item.key} item={item} onRetry={() => retry(item.key)} />
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function UploadRow({ item, onRetry }: { item: UploadItem; onRetry: () => void }) {
  const t = useTranslations('members.photos.upload');
  const failed = item.status === 'failed';
  const errorText = failed ? errorFor(t, item) : undefined;
  // Errors that a retry cannot fix: the file itself is the problem.
  const retryable =
    failed && !['VIDEO', 'NOT_AN_IMAGE', 'TOO_BIG', 'UNREADABLE'].includes(item.error ?? '');

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
          <p className="flex items-center gap-1.5 text-label text-danger">
            <AlertIcon width={14} height={14} className="shrink-0" />
            {errorText}
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

type Translate = ReturnType<typeof useTranslations<'members.photos.upload'>>;

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
      return t(`errors.${item.error}`);
    case 'TOO_LARGE':
      return t('errors.UPLOAD_FAILED');
    case 'GALLERY_FULL':
      return t('errors.GALLERY_FULL', { remaining: item.remaining ?? 0 });
    default:
      return t('errors.generic');
  }
}
