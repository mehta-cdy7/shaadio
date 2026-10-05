'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckCircleIcon } from '@/components/ui/icons';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import { patchJson } from '@/lib/api';
import { cn } from '@/lib/cn';
import { RSVP_STATUSES, type GuestResponse, type RsvpStatus } from '@/modules/guests/schemas';
import { RsvpBadge } from './rsvp-badge';
import { useRsvpLabel } from './rsvp-label';

type RsvpGuest = Pick<GuestResponse, 'id' | 'maxPeople' | 'rsvp' | 'version'>;

/**
 * The guest's RSVP and the member's "Update RSVP" editor (API_DESIGN §14 `PATCH …/rsvp`). The save
 * carries the version this page loaded: if the guest answered from their link meanwhile, the
 * member sees their answer instead of overwriting it (§6.1).
 */
export function RsvpCard({ guest: initial }: { guest: RsvpGuest }) {
  const t = useTranslations('members.guests.rsvpCard');
  const tr = useTranslations('members.guests.rsvp');
  const rsvpLabel = useRsvpLabel();
  const errorMessage = useApiErrorMessage();
  const router = useRouter();
  const [guest, setGuest] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<RsvpStatus>(initial.rsvp.status);
  const [count, setCount] = useState(Math.max(1, initial.rsvp.attendingCount));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  // A refreshed page (an edit elsewhere) brings a newer guest.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setGuest(initial);
  }

  const { rsvp } = guest;
  const respondedOn = rsvp.respondedAt
    ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(
        new Date(rsvp.respondedAt),
      )
    : undefined;

  function startEditing() {
    setStatus(rsvp.status);
    setCount(Math.min(guest.maxPeople, Math.max(1, rsvp.attendingCount)));
    setError(undefined);
    setSaved(false);
    setEditing(true);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const result = await patchJson<GuestResponse>(`/api/guests/${guest.id}/rsvp`, {
      status,
      ...(status === 'ATTENDING' ? { attendingCount: count } : {}),
      expectedVersion: guest.version,
    });
    setPending(false);
    if (result.ok) {
      setGuest(result.data);
      setEditing(false);
      setSaved(true);
      // The list, events and dashboard numbers changed.
      router.refresh();
      return;
    }
    const details = result.details as { current?: GuestResponse; maxPeople?: number } | undefined;
    if (result.code === 'VERSION_CONFLICT' && details?.current) {
      setGuest(details.current);
      setError(t('conflict', { answer: rsvpLabel(details.current.rsvp) }));
    } else if (result.code === 'CAPACITY_EXCEEDED') {
      setError(t('capacity', { max: details?.maxPeople ?? guest.maxPeople }));
    } else {
      setError(errorMessage(result));
    }
  }

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-headline-sm text-ink">{t('title')}</h2>
          <p className="mt-1 text-body text-ink-muted">
            {respondedOn
              ? t(rsvp.respondedVia === 'GUEST_LINK' ? 'byGuest' : 'byMember', {
                  date: respondedOn,
                })
              : t('noReply')}
          </p>
        </div>
        <RsvpBadge
          size="md"
          status={rsvp.status}
          label={
            rsvp.status === 'ATTENDING'
              ? t('attendingOf', { count: rsvp.attendingCount, max: guest.maxPeople })
              : rsvpLabel(rsvp)
          }
        />
      </div>

      {error && <Alert>{error}</Alert>}
      {saved && !editing && (
        <p role="status" className="flex items-center gap-1.5 text-body font-medium text-success">
          <CheckCircleIcon width={16} height={16} />
          {t('saved')}
        </p>
      )}

      {editing ? (
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-5 rounded-control bg-canvas-muted p-4"
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-body font-medium text-ink">{t('legend')}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {RSVP_STATUSES.map((value) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-2.5 rounded-control border border-line bg-surface px-3.5 py-3 text-body text-ink has-checked:border-primary has-checked:bg-primary-subtle has-focus-visible:outline-2 has-focus-visible:outline-focus"
                >
                  <input
                    type="radio"
                    name="status"
                    value={value}
                    checked={status === value}
                    onChange={() => setStatus(value)}
                    className="size-4 accent-primary"
                  />
                  {tr(value)}
                </label>
              ))}
            </div>
          </fieldset>

          {status === 'ATTENDING' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="attendingCount" className="text-body font-medium text-ink">
                {t('count')}
              </label>
              <select
                id="attendingCount"
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
                aria-describedby="attendingCount-hint"
                className="h-12 w-32 rounded-control border border-line bg-surface px-3.5 text-body-lg text-ink focus-visible:outline-2 focus-visible:outline-focus"
              >
                {Array.from({ length: guest.maxPeople }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <p id="attendingCount-hint" className="text-label text-ink-muted">
                {t('countHint', { max: guest.maxPeople })}
              </p>
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setEditing(false)} disabled={pending}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t('saving') : t('save')}
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" onClick={startEditing} className={cn('self-start')}>
          {t('update')}
        </Button>
      )}
    </Card>
  );
}
