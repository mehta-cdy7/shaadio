'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PhotosIcon, StarIcon, UploadIcon } from '@/components/ui/icons';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import { getJson } from '@/lib/api';
import { NO_EVENT, type Photo, type PhotoListResponse } from '@/modules/gallery/schemas';
import { PhotoViewer } from './photo-viewer';
import { UploadPanel } from './upload-panel';

export type EventName = { id: string; name: string };

/** Whether a newly published photo belongs in the album on screen. */
function belongsTo(photo: Photo, album: string | undefined): boolean {
  if (!album) return true;
  return album === NO_EVENT ? !photo.eventId : photo.eventId === album;
}

/**
 * The grid of one album (Stitch "Members Photos"): thumbnails only, lazily loaded, newest first,
 * "Load more" with the cursor (SYSTEM_DESIGN §42, API_DESIGN §5.2). Opening a photo loads its
 * display image in the viewer.
 */
export function PhotoGallery({
  page,
  query,
  album,
  featuredView,
  events,
  photosUsed,
  photoLimit,
  featuredCount: initialFeatured,
  featuredLimit,
  uploadsAvailable,
}: {
  page: PhotoListResponse;
  query: string;
  /** The event id or "none" on screen; undefined for all photos and for Featured. */
  album?: string;
  featuredView: boolean;
  events: EventName[];
  photosUsed: number;
  photoLimit: number;
  featuredCount: number;
  featuredLimit: number;
  uploadsAvailable: boolean;
}) {
  const t = useTranslations('members.photos');
  const errorMessage = useApiErrorMessage();
  const [items, setItems] = useState(page.items);
  const [cursor, setCursor] = useState(page.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [used, setUsed] = useState(photosUsed);
  const [featured, setFeatured] = useState(initialFeatured);
  const [open, setOpen] = useState<number>();
  const [uploading, setUploading] = useState(false);

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    setError(undefined);
    const params = new URLSearchParams(query);
    params.set('cursor', cursor);
    const result = await getJson<PhotoListResponse>(`/api/photos?${params}`);
    setLoading(false);
    if (result.ok) {
      setItems((prev) => [...prev, ...result.data.items]);
      setCursor(result.data.nextCursor);
    } else {
      setError(result.code === 'VALIDATION_ERROR' ? t('listChanged') : errorMessage(result));
    }
  }

  const onPublished = useCallback(
    (photo: Photo) => {
      setUsed((n) => n + 1);
      if (!featuredView && belongsTo(photo, album)) setItems((prev) => [photo, ...prev]);
    },
    [album, featuredView],
  );

  function onChanged(photo: Photo) {
    setItems((prev) => {
      const stays = featuredView ? photo.featured : belongsTo(photo, album);
      return stays
        ? prev.map((item) => (item.id === photo.id ? photo : item))
        : prev.filter((item) => item.id !== photo.id);
    });
  }

  function onDeleted(photo: Photo) {
    setUsed((n) => Math.max(0, n - 1));
    if (photo.featured) setFeatured((n) => Math.max(0, n - 1));
    setItems((prev) => prev.filter((item) => item.id !== photo.id));
  }

  const full = used >= photoLimit;
  const percent = Math.min(100, Math.round((used / photoLimit) * 100));

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-body text-ink">
            <span className="font-semibold">{t('usage', { used, limit: photoLimit })}</span>
            <span className="text-ink-muted">
              {' '}
              · {t('featuredUsage', { count: featured, limit: featuredLimit })}
            </span>
          </p>
          <div
            role="progressbar"
            aria-label={t('usageLabel')}
            aria-valuemin={0}
            aria-valuemax={photoLimit}
            aria-valuenow={used}
            className="h-2 overflow-hidden rounded-full bg-fill"
          >
            <div className="h-full rounded-full bg-secondary" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-label text-ink-muted">{t('retentionNote')}</p>
        </div>
        {uploadsAvailable && !uploading && (
          <Button
            onClick={() => setUploading(true)}
            disabled={full}
            className="self-start sm:self-auto"
          >
            <UploadIcon width={18} height={18} />
            {t('upload.open')}
          </Button>
        )}
      </Card>

      {!uploadsAvailable && <Alert>{t('storageOff')}</Alert>}
      {full && <Alert>{t('full', { limit: photoLimit })}</Alert>}

      {uploading && (
        <UploadPanel
          events={events}
          defaultEventId={album && album !== NO_EVENT ? album : undefined}
          onPublished={onPublished}
          onClose={() => setUploading(false)}
        />
      )}

      {items.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary-subtle text-ink-accent">
            {featuredView ? (
              <StarIcon width={26} height={26} />
            ) : (
              <PhotosIcon width={26} height={26} />
            )}
          </span>
          <h2 className="font-display text-headline-sm text-ink">
            {featuredView ? t('empty.featuredTitle') : t('empty.title')}
          </h2>
          <p className="max-w-md text-body-lg text-pretty text-ink-muted">
            {featuredView ? t('empty.featuredBody', { limit: featuredLimit }) : t('empty.body')}
          </p>
        </Card>
      ) : (
        <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4 sm:gap-2 lg:grid-cols-6">
          {items.map((photo, index) => (
            <li key={photo.id} className="relative">
              <button
                type="button"
                onClick={() => setOpen(index)}
                className="group block aspect-square w-full overflow-hidden rounded-control bg-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                aria-label={t('openPhoto', { index: index + 1 })}
              >
                {/* Private media bypass Next's optimiser: the browser-made thumbnail is the optimisation (SYSTEM §42). */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.thumbUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover transition-transform group-hover:scale-105"
                />
              </button>
              {photo.featured && (
                <span className="pointer-events-none absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-surface/90 text-secondary-ink shadow-card">
                  <StarIcon width={14} height={14} fill="currentColor" />
                  <span className="sr-only">{t('featuredBadge')}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <Alert>{error}</Alert>}
      {cursor && (
        <Button variant="outline" onClick={loadMore} disabled={loading} className="self-center">
          {loading ? t('loading') : t('loadMore')}
        </Button>
      )}

      {open !== undefined && items[open] && (
        <PhotoViewer
          photos={items}
          index={open}
          events={events}
          featuredCount={featured}
          featuredLimit={featuredLimit}
          onIndex={setOpen}
          onClose={() => setOpen(undefined)}
          onChanged={(photo, delta) => {
            setFeatured((n) => n + delta);
            onChanged(photo);
          }}
          onDeleted={(photo) => {
            onDeleted(photo);
            setOpen(undefined);
          }}
        />
      )}
    </div>
  );
}
