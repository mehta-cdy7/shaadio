'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { postJson } from '@/lib/api';
import {
  PHOTOS_PER_REQUEST,
  type CompleteUploadsResponse,
  type Photo,
  type UploadTicketsResponse,
} from '@/modules/gallery/schemas';
import { prepareImage, type PreparedPhoto } from './prepare-image';

/**
 * Drives the upload protocol in the browser (API_DESIGN §22): prepare each file, ask for upload
 * URLs in batches of 30, PUT the display image and thumbnail straight to R2 with per-photo
 * progress, then `complete`. Each photo succeeds or fails on its own and can be retried on its
 * own (PRD §9.22, edge cases). `base` is `/api/photos` for members; guests use their gallery path.
 */

export type UploadStatus = 'preparing' | 'uploading' | 'finishing' | 'done' | 'failed';

export type UploadItem = {
  key: string;
  name: string;
  status: UploadStatus;
  /** 0–1, while uploading. */
  progress: number;
  /** Object URL of the thumbnail once prepared, for the progress list. */
  previewUrl?: string;
  /** A PrepareError, an UploadFailure, an API error code or UPLOAD_FAILED. */
  error?: string;
  /** With GALLERY_FULL: how many photos still fit. */
  remaining?: number;
};

type Entry = { file: File; eventId?: string; uploaderName?: string; prepared?: PreparedPhoto };

const PUT_CONCURRENCY = 3;
const PUT_ATTEMPTS = 2;

/** Runs `task` over `items`, at most `limit` at a time. */
async function pool<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await task(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** PUT with upload progress (fetch cannot report it). Resolves true on a 2xx. */
function put(url: string, body: Blob, type: string, onProgress: (loaded: number) => void) {
  return new Promise<boolean>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', type);
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.onabort = () => resolve(false);
    xhr.send(body);
  });
}

async function putWithRetry(
  url: string,
  body: Blob,
  type: string,
  onProgress: (n: number) => void,
) {
  for (let attempt = 0; attempt < PUT_ATTEMPTS; attempt++) {
    onProgress(0);
    if (await put(url, body, type, onProgress)) return true;
  }
  return false;
}

export function usePhotoUploader({
  base,
  headers,
  onPublished,
}: {
  base: string;
  /** Sent with every API call; guests send their `X-Device-Id`. */
  headers?: Record<string, string>;
  onPublished: (photo: Photo) => void;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const entries = useRef(new Map<string, Entry>());
  const counter = useRef(0);
  const published = useRef(onPublished);
  useEffect(() => {
    published.current = onPublished;
  }, [onPublished]);

  const update = useCallback((key: string, patch: Partial<UploadItem>) => {
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }, []);

  const fail = useCallback(
    (key: string, error: string, extra: Partial<UploadItem> = {}) =>
      update(key, { status: 'failed', progress: 0, error, ...extra }),
    [update],
  );

  const uploadBatch = useCallback(
    async (keys: string[], eventId: string | undefined, uploaderName: string | undefined) => {
      const prepared = keys.map((key) => entries.current.get(key)!.prepared!);
      const request = await postJson<UploadTicketsResponse>(
        `${base}/upload-requests`,
        {
          ...(eventId ? { eventId } : {}),
          ...(uploaderName ? { uploaderName } : {}),
          photos: prepared.map((p) => ({
            mimeType: p.mimeType,
            displayBytes: p.display.size,
            thumbBytes: p.thumb.size,
            width: p.width,
            height: p.height,
          })),
        },
        headers,
      );
      if (!request.ok) {
        const remaining = (request.details as { remaining?: number } | undefined)?.remaining;
        for (const key of keys)
          fail(key, request.code, remaining === undefined ? {} : { remaining });
        return;
      }

      // 3. Straight to R2: display and thumbnail, with progress over both.
      const uploaded: Array<{ key: string; uploadId: string }> = [];
      const abandoned: string[] = [];
      await pool(
        request.data.uploads.map((ticket, i) => ({ ticket, key: keys[i]!, photo: prepared[i]! })),
        PUT_CONCURRENCY,
        async ({ ticket, key, photo }) => {
          const total = photo.display.size + photo.thumb.size;
          let thumbDone = 0;
          const thumbOk = await putWithRetry(
            ticket.thumbPutUrl,
            photo.thumb,
            photo.mimeType,
            (n) => {
              thumbDone = n;
              update(key, { progress: n / total });
            },
          );
          const displayOk =
            thumbOk &&
            (await putWithRetry(ticket.displayPutUrl, photo.display, photo.mimeType, (n) =>
              update(key, { progress: Math.min(0.99, (thumbDone + n) / total) }),
            ));
          if (displayOk) {
            uploaded.push({ key, uploadId: ticket.uploadId });
            update(key, { status: 'finishing', progress: 1 });
          } else {
            abandoned.push(ticket.uploadId);
            fail(key, 'UPLOAD_FAILED');
          }
        },
      );
      if (abandoned.length) void postJson(`${base}/cancel`, { uploadIds: abandoned }, headers);
      if (!uploaded.length) return;

      // 4. Verify and publish.
      const done = await postJson<CompleteUploadsResponse>(
        `${base}/complete`,
        { uploadIds: uploaded.map((u) => u.uploadId) },
        headers,
      );
      const keyOf = new Map(uploaded.map((u) => [u.uploadId, u.key]));
      if (!done.ok) {
        for (const { key } of uploaded) fail(key, done.code);
        return;
      }
      for (const result of done.data.results) {
        const key = keyOf.get(result.uploadId);
        if (!key) continue;
        if (result.status === 'PUBLISHED') {
          update(key, { status: 'done' });
          published.current(result.photo);
        } else if (result.status === 'FAILED') {
          fail(key, result.reason);
        } else {
          // Not pending any more: a retry after a lost response. It is in the gallery already.
          update(key, { status: 'done' });
        }
      }
    },
    [base, headers, fail, update],
  );

  const run = useCallback(
    async (keys: string[]) => {
      // 1. Prepare, one at a time: decoding big photos in parallel exhausts a phone's memory.
      const ready: string[] = [];
      for (const key of keys) {
        const entry = entries.current.get(key)!;
        if (!entry.prepared) {
          update(key, { status: 'preparing', error: undefined, progress: 0 });
          const result = await prepareImage(entry.file);
          if ('error' in result) {
            fail(key, result.error);
            continue;
          }
          entry.prepared = result;
          update(key, { previewUrl: URL.createObjectURL(result.thumb) });
        }
        update(key, { status: 'uploading', error: undefined, progress: 0 });
        ready.push(key);
      }

      // 2. One upload request per 30 photos, album and name.
      const groups = new Map<string, { eventId?: string; uploaderName?: string; keys: string[] }>();
      for (const key of ready) {
        const { eventId, uploaderName } = entries.current.get(key)!;
        const group = JSON.stringify([eventId ?? '', uploaderName ?? '']);
        const existing = groups.get(group) ?? { eventId, uploaderName, keys: [] };
        existing.keys.push(key);
        groups.set(group, existing);
      }
      for (const group of groups.values()) {
        for (let start = 0; start < group.keys.length; start += PHOTOS_PER_REQUEST) {
          await uploadBatch(
            group.keys.slice(start, start + PHOTOS_PER_REQUEST),
            group.eventId,
            group.uploaderName,
          );
        }
      }
    },
    [fail, update, uploadBatch],
  );

  /**
   * Adds files to the list and uploads them into `eventId`'s album (none: "Other"). Guests may
   * pass their name.
   */
  const add = useCallback(
    (files: File[], eventId?: string, uploaderName?: string) => {
      const keys = files.map((file) => {
        const key = `u${++counter.current}`;
        entries.current.set(key, {
          file,
          ...(eventId ? { eventId } : {}),
          ...(uploaderName ? { uploaderName } : {}),
        });
        return { key, name: file.name };
      });
      setItems((list) => [
        ...list,
        ...keys.map(({ key, name }) => ({ key, name, status: 'preparing' as const, progress: 0 })),
      ]);
      void run(keys.map((k) => k.key));
    },
    [run],
  );

  const retry = useCallback((key: string) => void run([key]), [run]);

  /** Clears finished and failed photos from the list; photos still uploading stay. */
  const clearFinished = useCallback(() => {
    setItems((list) => {
      const keep = list.filter((item) => item.status !== 'done' && item.status !== 'failed');
      for (const item of list) {
        if (keep.includes(item)) continue;
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        entries.current.delete(item.key);
      }
      return keep;
    });
  }, []);

  return { items, add, retry, clearFinished };
}
