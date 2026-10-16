'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DownloadIcon,
  StarIcon,
  TrashIcon,
} from '@/components/ui/icons';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import { deleteJson, patchJson } from '@/lib/api';
import type { Photo } from '@/modules/gallery/schemas';
import type { EventName } from './photo-gallery';

function formatInstant(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

/**
 * The full-screen viewer (Stitch "Photo viewer", member version): the display image, previous and
 * next, and the member actions: feature for the website, move album, download, delete. The bar
 * uses solid surface colours, not text over the photo, so it stays readable on any image.
 */
export function PhotoViewer({
  photos,
  index,
  events,
  featuredCount,
  featuredLimit,
  onIndex,
  onClose,
  onChanged,
  onDeleted,
}: {
  photos: Photo[];
  index: number;
  events: EventName[];
  featuredCount: number;
  featuredLimit: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  /** `delta` is the change in featured photos (−1, 0 or +1). */
  onChanged: (photo: Photo, delta: number) => void;
  onDeleted: (photo: Photo) => void;
}) {
  const t = useTranslations('members.photos.viewer');
  const errorMessage = useApiErrorMessage();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const photo = photos[index]!;
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();

  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);

  // A different photo starts with a clean slate.
  const [shown, setShown] = useState(photo.id);
  if (shown !== photo.id) {
    setShown(photo.id);
    setConfirming(false);
    setError(undefined);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft' && hasPrev) onIndex(index - 1);
      if (event.key === 'ArrowRight' && hasNext) onIndex(index + 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasPrev, hasNext, index, onIndex]);

  async function patch(body: { featured?: boolean; eventId?: string | null }) {
    setPending(true);
    setError(undefined);
    const result = await patchJson<Photo>(`/api/photos/${photo.id}`, body);
    setPending(false);
    if (!result.ok) {
      setError(
        result.code === 'FEATURED_LIMIT'
          ? t('featuredLimit', { limit: featuredLimit })
          : result.code === 'NOT_FOUND'
            ? t('gone')
            : errorMessage(result),
      );
      return;
    }
    const delta = Number(result.data.featured) - Number(photo.featured);
    onChanged(result.data, delta);
  }

  async function remove() {
    setPending(true);
    setError(undefined);
    const result = await deleteJson(`/api/photos/${photo.id}`);
    setPending(false);
    if (!result.ok && result.code !== 'NOT_FOUND') {
      setError(errorMessage(result));
      return;
    }
    onDeleted(photo);
  }

  async function download() {
    // A cross-origin <a download> is ignored by browsers, so fetch the image and save the blob.
    try {
      const res = await fetch(photo.displayUrl);
      if (!res.ok) throw new Error('download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `photo-${photo.id}.${blob.type === 'image/jpeg' ? 'jpg' : (blob.type.split('/')[1] ?? 'webp')}`;
      link.click();
      // Some browsers (Firefox, mobile) start the download after click() returns.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      window.open(photo.displayUrl, '_blank', 'noopener');
    }
  }

  const eventName = events.find((event) => event.id === photo.eventId)?.name;
  const featureBlocked = !photo.featured && featuredCount >= featuredLimit;

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-label={t('label')}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 backdrop:bg-ink/90"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 bg-surface px-4 py-3 text-ink">
          <p className="min-w-0 truncate text-body">
            <span className="font-semibold">{photo.uploaderName ?? t('guest')}</span>
            <span className="text-ink-muted">
              {' · '}
              {eventName ?? t('other')} · {formatInstant(photo.createdAt)}
            </span>
          </p>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="rounded-control p-2 text-ink-muted hover:bg-fill hover:text-ink"
            aria-label={t('close')}
          >
            <CloseIcon width={22} height={22} />
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center p-2 sm:p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={photo.id}
            src={photo.displayUrl}
            alt=""
            width={photo.width}
            height={photo.height}
            className="max-h-full max-w-full object-contain"
          />
          {hasPrev && (
            <button
              type="button"
              onClick={() => onIndex(index - 1)}
              className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-surface p-2.5 text-ink shadow-float sm:left-4"
              aria-label={t('previous')}
            >
              <ChevronLeftIcon width={22} height={22} />
            </button>
          )}
          {hasNext && (
            <button
              type="button"
              onClick={() => onIndex(index + 1)}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-surface p-2.5 text-ink shadow-float sm:right-4"
              aria-label={t('next')}
            >
              <ChevronRightIcon width={22} height={22} />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-3 bg-surface px-4 py-3 text-ink">
          {error && (
            <p role="alert" className="text-body font-medium text-danger">
              {error}
            </p>
          )}
          {confirming ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-body text-ink">{t('confirmDelete')}</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
                  {t('cancel')}
                </Button>
                <Button variant="danger" onClick={remove} disabled={pending}>
                  {t('delete')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={photo.featured ? 'primary' : 'outline'}
                onClick={() => patch({ featured: !photo.featured })}
                disabled={pending || featureBlocked}
                aria-pressed={photo.featured}
                title={featureBlocked ? t('featuredLimit', { limit: featuredLimit }) : undefined}
              >
                <StarIcon width={18} height={18} fill={photo.featured ? 'currentColor' : 'none'} />
                {photo.featured ? t('featured') : t('feature')}
              </Button>
              <label htmlFor={`${id}-album`} className="sr-only">
                {t('album')}
              </label>
              <select
                id={`${id}-album`}
                value={photo.eventId ?? ''}
                onChange={(event) => patch({ eventId: event.target.value || null })}
                disabled={pending}
                className="h-10 rounded-control border border-line bg-surface px-3 text-body text-ink md:h-11"
              >
                <option value="">{t('other')}</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
              <Button variant="outline" onClick={download}>
                <DownloadIcon width={18} height={18} />
                {t('download')}
              </Button>
              <Button
                variant="outline"
                onClick={() => setConfirming(true)}
                disabled={pending}
                className="ml-auto text-danger"
              >
                <TrashIcon width={18} height={18} />
                {t('delete')}
              </Button>
            </div>
          )}
          <p className="text-label text-ink-muted">
            {t('position', { index: index + 1, total: photos.length })} · {t('featuredNote')}
          </p>
        </div>
      </div>
    </dialog>
  );
}
