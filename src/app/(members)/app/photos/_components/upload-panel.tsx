'use client';

import { useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { UploadList } from '@/components/photos/upload-list';
import { usePhotoUploader } from '@/components/photos/use-photo-uploader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, inputClasses } from '@/components/ui/field';
import { CloseIcon, UploadIcon } from '@/components/ui/icons';
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

      <UploadList items={items} onRetry={retry} onClear={clearFinished} />
    </Card>
  );
}
