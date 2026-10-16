'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { UploadList } from '@/components/photos/upload-list';
import { usePhotoUploader } from '@/components/photos/use-photo-uploader';
import { Button } from '@/components/ui/button';
import { Field, inputClasses } from '@/components/ui/field';
import { UploadIcon } from '@/components/ui/icons';
import { DEVICE_ID_HEADER, DEVICE_ID_PATTERN, UPLOADER_NAME_MAX } from '@/modules/gallery/schemas';

const DEVICE_KEY = 'shaadio.deviceId';

/**
 * The browser's device id for the daily upload limit (API_DESIGN §7): random, made once, kept in
 * this browser. Private mode or blocked storage gets a fresh id per visit, which is accepted.
 */
function deviceId(): string {
  try {
    const stored = localStorage.getItem(DEVICE_KEY);
    if (stored && DEVICE_ID_PATTERN.test(stored)) return stored;
  } catch {
    // Storage blocked: fall through to a fresh id.
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const id = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  try {
    localStorage.setItem(DEVICE_KEY, id);
  } catch {
    // Not kept: the limit then applies per visit.
  }
  return id;
}

/**
 * Guest upload (PRD §9.22 flow): optional name, optional ceremony, pick photos, per-photo progress.
 * Photos appear in the gallery straight away; there is no approval step.
 */
export function GuestUpload({
  token,
  albums,
  defaultEventId,
}: {
  token: string;
  albums: { eventId: string; name: string }[];
  defaultEventId?: string;
}) {
  const t = useTranslations('gallery.upload');
  const id = useId();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [eventId, setEventId] = useState(defaultEventId ?? '');
  // Read in the browser only; it is sent with requests and never rendered.
  const [headers] = useState((): Record<string, string> =>
    typeof window === 'undefined' ? {} : { [DEVICE_ID_HEADER]: deviceId() },
  );

  const { items, add, retry, clearFinished } = usePhotoUploader({
    base: `/api/public/gallery/${token}`,
    headers,
    onPublished: () => {},
  });

  // When a round of uploads settles, show the new photos in the gallery below.
  const active = items.some((item) => item.status !== 'done' && item.status !== 'failed');
  const done = items.filter((item) => item.status === 'done').length;
  const shownDone = useRef(0);
  useEffect(() => {
    // "Clear list" restarts the count.
    if (done < shownDone.current) shownDone.current = done;
    if (active || done <= shownDone.current) return;
    shownDone.current = done;
    router.refresh();
  }, [active, done, router]);

  function choose(files: FileList | null) {
    if (!files?.length) return;
    const trimmed = name.trim();
    add([...files], eventId || undefined, trimmed || undefined);
    if (input.current) input.current.value = '';
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-5 rounded-card border border-line bg-surface p-5 shadow-card md:p-7"
    >
      <div>
        <h2 id={`${id}-title`} className="font-display text-headline-sm text-ink">
          {t('title')}
        </h2>
        <p className="mt-1 text-body text-ink-muted">{t('lead')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${id}-name`} label={t('name')} hint={t('nameHint')}>
          <input
            id={`${id}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={UPLOADER_NAME_MAX}
            autoComplete="name"
            placeholder={t('namePlaceholder')}
            className={inputClasses}
          />
        </Field>
        {albums.length > 0 && (
          <Field id={`${id}-album`} label={t('album')}>
            <select
              id={`${id}-album`}
              value={eventId}
              onChange={(event) => setEventId(event.target.value)}
              className={inputClasses}
            >
              <option value="">{t('other')}</option>
              {albums.map((album) => (
                <option key={album.eventId} value={album.eventId}>
                  {album.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <Button size="lg" onClick={() => input.current?.click()}>
        <UploadIcon width={20} height={20} />
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
      <p className="text-label text-ink-muted">{t('note')}</p>

      <UploadList items={items} onRetry={retry} onClear={clearFinished} />
    </section>
  );
}
