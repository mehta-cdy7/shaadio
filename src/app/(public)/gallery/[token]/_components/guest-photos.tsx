'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DownloadIcon,
  PhotosIcon,
} from '@/components/ui/icons';
import { getJson } from '@/lib/api';
import type { PublicPhoto, PublicPhotoListResponse } from '@/modules/gallery/schemas';

/**
 * Everyone's photos for guests (PRD §9.20): thumbnails, "Load more", and a simple viewer with
 * download. Guests cannot delete or feature.
 */
export function GuestPhotos({
  token,
  page,
  album,
}: {
  token: string;
  page: PublicPhotoListResponse;
  album?: string;
}) {
  const t = useTranslations('gallery');
  const [first, setFirst] = useState(page);
  const [items, setItems] = useState(page.items);
  const [cursor, setCursor] = useState(page.nextCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<number>();

  // A refreshed first page (after this guest's own upload) starts the list again.
  if (first !== page) {
    setFirst(page);
    setItems(page.items);
    setCursor(page.nextCursor);
  }

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    setFailed(false);
    const params = new URLSearchParams({ cursor, ...(album ? { eventId: album } : {}) });
    const result = await getJson<PublicPhotoListResponse>(
      `/api/public/gallery/${token}/photos?${params}`,
    );
    setLoading(false);
    if (!result.ok) {
      setFailed(true);
      return;
    }
    setItems((prev) => [...prev, ...result.data.items]);
    setCursor(result.data.nextCursor);
  }

  if (!items.length) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface p-10 text-center">
        <PhotosIcon width={28} height={28} className="text-secondary-ink" />
        <p className="text-body-lg text-ink-muted">{t('empty')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4 sm:gap-2 lg:grid-cols-5">
        {items.map((photo, index) => (
          <li key={photo.id}>
            <button
              type="button"
              onClick={() => setOpen(index)}
              aria-label={t('openPhoto', { index: index + 1 })}
              className="block aspect-square w-full overflow-hidden rounded-control bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.thumbUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
            </button>
          </li>
        ))}
      </ul>
      {failed && <p className="text-center text-body text-danger">{t('loadFailed')}</p>}
      {cursor && (
        <Button variant="outline" onClick={loadMore} disabled={loading} className="self-center">
          {loading ? t('loading') : t('loadMore')}
        </Button>
      )}
      {open !== undefined && items[open] && (
        <GuestViewer
          photos={items}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(undefined)}
        />
      )}
    </div>
  );
}

function GuestViewer({
  photos,
  index,
  onIndex,
  onClose,
}: {
  photos: PublicPhoto[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations('gallery.viewer');
  const dialog = useRef<HTMLDialogElement>(null);
  const photo = photos[index]!;
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft' && hasPrev) onIndex(index - 1);
      if (event.key === 'ArrowRight' && hasNext) onIndex(index + 1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasPrev, hasNext, index, onIndex]);

  async function download() {
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
            {photo.uploaderName
              ? t('by', { name: photo.uploaderName })
              : t('position', { index: index + 1, total: photos.length })}
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
        <div className="relative flex min-h-0 flex-1 items-center justify-center p-2">
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
              className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-surface p-2.5 text-ink shadow-float"
              aria-label={t('previous')}
            >
              <ChevronLeftIcon width={22} height={22} />
            </button>
          )}
          {hasNext && (
            <button
              type="button"
              onClick={() => onIndex(index + 1)}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-surface p-2.5 text-ink shadow-float"
              aria-label={t('next')}
            >
              <ChevronRightIcon width={22} height={22} />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 bg-surface px-4 py-3">
          <p className="text-label text-ink-muted">{t('downloadNote')}</p>
          <Button variant="outline" onClick={download}>
            <DownloadIcon width={18} height={18} />
            {t('download')}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
