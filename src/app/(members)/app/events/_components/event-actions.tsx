'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertIcon, MoreIcon } from '@/components/ui/icons';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import { deleteJson, getJson } from '@/lib/api';
import type { EventDeletePreview } from '@/modules/events/schemas';

/**
 * The "⋯" menu on an event card (Edit, Delete) and the delete confirmation. The dialog loads
 * `delete-preview` first, so it can say who loses the event (DATABASE_DESIGN §14.1).
 */
export function EventActions({ id, name }: { id: string; name: string }) {
  const t = useTranslations('members.events');
  const errorMessage = useApiErrorMessage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<EventDeletePreview>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const menuRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Close the menu on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function askToDelete() {
    setOpen(false);
    setPreview(undefined);
    setError(undefined);
    dialogRef.current?.showModal();
    const result = await getJson<EventDeletePreview>(`/api/events/${id}/delete-preview`);
    if (result.ok) setPreview(result.data);
    else setError(errorMessage(result));
  }

  async function confirmDelete() {
    setPending(true);
    setError(undefined);
    const result = await deleteJson(`/api/events/${id}`);
    setPending(false);
    if (!result.ok && result.code !== 'NOT_FOUND') {
      setError(errorMessage(result));
      return;
    }
    // Deleted (or already gone): close and reload the list.
    dialogRef.current?.close();
    router.refresh();
  }

  const unlinked = preview ? preview.tasks + preview.expenses + preview.photos : 0;
  const names = preview?.onlyThisEvent.names ?? [];
  const extra = (preview?.onlyThisEvent.count ?? 0) - names.length;

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-label={t('list.actions', { name })}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex size-9 items-center justify-center rounded-control text-ink-muted hover:bg-fill hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
      >
        <MoreIcon width={20} height={20} />
      </button>
      {open && (
        <ul
          role="menu"
          className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-control border border-line bg-surface py-1 shadow-float"
        >
          <li role="none">
            <Link
              role="menuitem"
              href={`/app/events/${id}`}
              className="block px-4 py-2.5 text-body text-ink hover:bg-fill focus-visible:bg-fill focus-visible:outline-none"
            >
              {t('list.edit')}
            </Link>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={askToDelete}
              className="block w-full px-4 py-2.5 text-left text-body text-danger hover:bg-danger-subtle focus-visible:bg-danger-subtle focus-visible:outline-none"
            >
              {t('list.delete')}
            </button>
          </li>
        </ul>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby={`delete-${id}-title`}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-card bg-surface p-0 text-ink shadow-float backdrop:bg-ink/40"
      >
        <div className="flex gap-4 p-6 sm:p-8">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-danger-subtle text-danger">
            <AlertIcon width={20} height={20} />
          </span>
          <div className="flex min-w-0 flex-col gap-4">
            <h2 id={`delete-${id}-title`} className="font-display text-headline-sm text-ink">
              {t('delete.title', { name })}
            </h2>
            {error && <Alert>{error}</Alert>}
            <div aria-live="polite" className="flex flex-col gap-2 text-body-lg text-ink">
              {!preview && !error && <p className="text-ink-muted">{t('delete.checking')}</p>}
              {preview && preview.invitedCount === 0 && <p>{t('delete.noGuests', { name })}</p>}
              {preview && preview.invitedCount > 0 && (
                <p>{t('delete.invited', { count: preview.invitedCount, name })}</p>
              )}
              {preview && preview.onlyThisEvent.count > 0 && (
                <p>
                  {t('delete.onlyThis', {
                    count: preview.onlyThisEvent.count,
                    names: names.length
                      ? names.join(', ') + (extra > 0 ? ` +${extra}` : '')
                      : 'none',
                  })}
                </p>
              )}
              {unlinked > 0 && <p>{t('delete.unlinked', { count: unlinked })}</p>}
            </div>
            <p className="text-body text-secondary-ink">{t('delete.irreversible')}</p>
            <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => dialogRef.current?.close()}>
                {t('delete.cancel')}
              </Button>
              <Button variant="danger" onClick={confirmDelete} disabled={!preview || pending}>
                {pending ? t('delete.deleting') : t('delete.confirm')}
              </Button>
            </div>
          </div>
        </div>
      </dialog>
    </div>
  );
}
