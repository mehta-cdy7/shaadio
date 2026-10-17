'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ImageIcon, TrashIcon, UploadIcon } from '@/components/ui/icons';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import { deleteJson, postJson } from '@/lib/api';
import type { CoverTarget, CoverUploadResponse } from '@/modules/gallery/schemas';
import { prepareImage } from './prepare-image';

type State = 'idle' | 'working' | 'removing';

/**
 * A wedding or event cover image (API_DESIGN §23): pick a photo, it is resized in the browser,
 * uploaded straight to R2 and then set. Replacing or removing deletes the old file on the server.
 */
export function CoverCard({
  target,
  eventId,
  initialUrl,
  title,
  hint,
}: {
  target: CoverTarget;
  eventId?: string;
  initialUrl?: string;
  title: string;
  hint: string;
}) {
  const t = useTranslations('coverImage');
  const errorMessage = useApiErrorMessage();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string>();

  async function upload(file: File | undefined) {
    if (!file) return;
    setState('working');
    setError(undefined);
    try {
      const prepared = await prepareImage(file);
      if ('error' in prepared) {
        setError(t(`prepare.${prepared.error}`));
        return;
      }
      const request = await postJson<CoverUploadResponse>('/api/covers/upload-request', {
        target,
        ...(eventId ? { eventId } : {}),
        mimeType: prepared.mimeType,
        bytes: prepared.display.size,
        width: prepared.width,
        height: prepared.height,
      });
      if (!request.ok) {
        setError(errorMessage(request));
        return;
      }
      const put = await fetch(request.data.putUrl, {
        method: 'PUT',
        headers: { 'Content-Type': prepared.mimeType },
        body: prepared.display,
      }).catch(() => undefined);
      if (!put?.ok) {
        setError(t('uploadFailed'));
        return;
      }
      const done = await postJson<{ coverImageUrl?: string }>('/api/covers/complete', {
        ticket: request.data.ticket,
      });
      if (!done.ok) {
        setError(done.code === 'VALIDATION_ERROR' ? t('uploadFailed') : errorMessage(done));
        return;
      }
      setUrl(done.data.coverImageUrl);
      router.refresh();
    } finally {
      setState('idle');
      if (input.current) input.current.value = '';
    }
  }

  async function remove() {
    setState('removing');
    setError(undefined);
    const query = new URLSearchParams({ target, ...(eventId ? { eventId } : {}) });
    const result = await deleteJson(`/api/covers?${query}`);
    setState('idle');
    if (!result.ok) {
      setError(errorMessage(result));
      return;
    }
    setUrl(undefined);
    router.refresh();
  }

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-headline-sm text-ink">{title}</h2>
        <p className="mt-1 text-body text-ink-muted">{hint}</p>
      </div>
      <div className="flex aspect-[16/9] items-center justify-center overflow-hidden rounded-card bg-fill">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <ImageIcon width={32} height={32} className="text-ink-muted" />
        )}
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => input.current?.click()} disabled={state !== 'idle'}>
          <UploadIcon width={18} height={18} />
          {state === 'working' ? t('uploading') : url ? t('change') : t('add')}
        </Button>
        {url && (
          <Button variant="outline" onClick={remove} disabled={state !== 'idle'}>
            <TrashIcon width={18} height={18} />
            {state === 'removing' ? t('removing') : t('remove')}
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*,.heic,.heif"
        hidden
        onChange={(event) => upload(event.target.files?.[0])}
      />
    </Card>
  );
}
