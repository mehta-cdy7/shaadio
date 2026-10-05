'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertIcon, MoreIcon } from '@/components/ui/icons';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import { deleteJson } from '@/lib/api';
import { formatPhone } from '@/lib/phone';
import type { GuestResponse } from '@/modules/guests/schemas';
import { RsvpBadge } from './rsvp-badge';
import { useRsvpLabel } from './rsvp-label';

/**
 * The "⋯" menu for a guest (View, Edit, Delete) and the delete confirmation (Stitch "Guest Detail
 * & Delete Confirmation"). On the guest's own page `onDetail` drops "View" and, after deleting,
 * goes back to the list.
 */
export function GuestActions({
  guest,
  onDetail = false,
}: {
  guest: Pick<GuestResponse, 'id' | 'name' | 'phone' | 'email' | 'rsvp'>;
  onDetail?: boolean;
}) {
  const t = useTranslations('members.guests');
  const rsvpLabel = useRsvpLabel();
  const errorMessage = useApiErrorMessage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const menuRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  // The list renders a menu per layout (table and cards), so ids must be unique per instance.
  const titleId = useId();

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

  function askToDelete() {
    setOpen(false);
    setError(undefined);
    dialogRef.current?.showModal();
  }

  async function confirmDelete() {
    setPending(true);
    setError(undefined);
    const result = await deleteJson(`/api/guests/${guest.id}`);
    if (!result.ok && result.code !== 'NOT_FOUND') {
      setPending(false);
      setError(errorMessage(result));
      return;
    }
    // Deleted (or already gone, API §6.3).
    if (onDetail) {
      router.replace('/app/guests');
      router.refresh();
      return;
    }
    setPending(false);
    dialogRef.current?.close();
    router.refresh();
  }

  const itemClasses =
    'block w-full px-4 py-2.5 text-left text-body text-ink hover:bg-fill focus-visible:bg-fill focus-visible:outline-none';
  const contact = guest.phone ? formatPhone(guest.phone) : guest.email;

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-label={t('menu.label', { name: guest.name })}
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
          {!onDetail && (
            <li role="none">
              <Link role="menuitem" href={`/app/guests/${guest.id}`} className={itemClasses}>
                {t('menu.view')}
              </Link>
            </li>
          )}
          <li role="none">
            <Link role="menuitem" href={`/app/guests/${guest.id}/edit`} className={itemClasses}>
              {t('menu.edit')}
            </Link>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={askToDelete}
              className="block w-full px-4 py-2.5 text-left text-body text-danger hover:bg-danger-subtle focus-visible:bg-danger-subtle focus-visible:outline-none"
            >
              {t('menu.delete')}
            </button>
          </li>
        </ul>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-card bg-surface p-0 text-ink shadow-float backdrop:bg-ink/40"
      >
        <div className="flex gap-4 p-6 sm:p-8">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-danger-subtle text-danger">
            <AlertIcon width={20} height={20} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div>
              <p className="text-label-sm font-semibold tracking-widest text-danger uppercase">
                {t('delete.eyebrow')}
              </p>
              <h2 id={titleId} className="mt-1 font-display text-headline-sm break-words text-ink">
                {t('delete.title', { name: guest.name })}
              </h2>
            </div>
            {error && <Alert>{error}</Alert>}
            <p className="text-body-lg text-ink">{t('delete.body')}</p>
            <div className="flex items-center justify-between gap-3 rounded-control bg-canvas-muted px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-body font-medium text-ink">{guest.name}</p>
                {contact && <p className="truncate text-label text-ink-muted">{contact}</p>}
              </div>
              <RsvpBadge status={guest.rsvp.status} label={rsvpLabel(guest.rsvp)} />
            </div>
            <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => dialogRef.current?.close()}>
                {t('delete.cancel')}
              </Button>
              <Button variant="danger" onClick={confirmDelete} disabled={pending}>
                {pending ? t('delete.deleting') : t('delete.confirm')}
              </Button>
            </div>
          </div>
        </div>
      </dialog>
    </div>
  );
}
