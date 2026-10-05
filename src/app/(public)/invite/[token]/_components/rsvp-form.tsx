'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  CalendarIcon,
  CheckCircleIcon,
  CheckIcon,
  LockIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
} from '@/components/ui/icons';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import { getJson, postJson } from '@/lib/api';
import { cn } from '@/lib/cn';
import type {
  GuestRsvpResponse,
  InvitationResponse,
  InvitationRsvp,
} from '@/modules/invitations/schemas';

type Props = {
  token: string;
  maxPeople: number;
  initialRsvp: InvitationRsvp;
  rsvpLocked: boolean;
  /** The RSVP deadline, already formatted. */
  deadline?: string;
};

const card = 'rounded-card border border-line bg-surface p-6 shadow-card md:p-8';

/**
 * The guest's one answer for all their events (PRD §9.11, API_DESIGN §24). After the deadline the
 * last answer is shown read-only. Returning to the tab re-reads the invitation, in case the family
 * changed the allowed number or the deadline meanwhile.
 */
export function RsvpForm({
  token,
  maxPeople: initialMax,
  initialRsvp,
  rsvpLocked,
  deadline,
}: Props) {
  const t = useTranslations('invite.rsvp');
  const errorMessage = useApiErrorMessage();
  const [rsvp, setRsvp] = useState(initialRsvp);
  const [locked, setLocked] = useState(rsvpLocked);
  const [maxPeople, setMaxPeople] = useState(initialMax);
  const [editing, setEditing] = useState(initialRsvp.status === 'PENDING');
  const [attending, setAttending] = useState(initialRsvp.status !== 'NOT_ATTENDING');
  const [count, setCount] = useState(Math.min(initialMax, Math.max(1, initialRsvp.attendingCount)));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    async function refresh() {
      if (document.visibilityState !== 'visible') return;
      const result = await getJson<InvitationResponse>(`/api/public/invite/${token}`);
      if (!result.ok) return;
      setLocked(result.data.rsvpLocked);
      setMaxPeople(result.data.guest.maxPeople);
      setCount((value) => Math.min(value, result.data.guest.maxPeople));
      setRsvp(result.data.rsvp);
    }
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [token]);

  function startEditing() {
    setAttending(rsvp.status !== 'NOT_ATTENDING');
    setCount(Math.min(maxPeople, Math.max(1, rsvp.attendingCount)));
    setError(undefined);
    setEditing(true);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const result = await postJson<GuestRsvpResponse>(
      `/api/public/invite/${token}/rsvp`,
      attending ? { status: 'ATTENDING', attendingCount: count } : { status: 'NOT_ATTENDING' },
    );
    setPending(false);
    if (result.ok) {
      setRsvp(result.data.rsvp);
      setEditing(false);
      return;
    }
    const details = result.details as { maxPeople?: number } | undefined;
    if (result.code === 'CAPACITY_EXCEEDED' && details?.maxPeople) {
      setMaxPeople(details.maxPeople);
      setCount((value) => Math.min(value, details.maxPeople!));
      setError(t('capacity', { max: details.maxPeople }));
    } else if (result.code === 'RSVP_LOCKED') {
      setLocked(true);
    } else if (result.code === 'NO_EVENTS') {
      setError(t('noEventsError'));
    } else if (result.code === 'NOT_FOUND') {
      setError(t('unavailable'));
    } else {
      setError(errorMessage(result));
    }
  }

  if (locked) {
    const answer =
      rsvp.status === 'ATTENDING'
        ? t('lockedAttending', { count: rsvp.attendingCount })
        : rsvp.status === 'NOT_ATTENDING'
          ? t('lockedNotAttending')
          : t('lockedPending');
    return (
      <section aria-labelledby="rsvp-title" className={cn(card, 'flex flex-col gap-5')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="rsvp-title" className="font-display text-headline-sm text-ink">
            {t('lockedTitle')}
          </h2>
          <p className="rounded-full bg-pending px-3 py-1 text-label font-semibold text-on-pending">
            {answer}
          </p>
        </div>
        <p className="flex items-start gap-3 rounded-control bg-canvas-muted p-4 text-body text-ink">
          <LockIcon width={20} height={20} className="mt-0.5 shrink-0 text-secondary-ink" />
          {t('lockedMessage')}
        </p>
      </section>
    );
  }

  if (!editing) {
    return (
      <section
        aria-labelledby="rsvp-title"
        className={cn(card, 'flex flex-col items-center gap-4 text-center')}
      >
        <CheckCircleIcon width={40} height={40} className="text-success" />
        <h2 id="rsvp-title" className="font-display text-headline-md text-ink">
          {t('thanks')}
        </h2>
        <p
          role="status"
          className="rounded-full bg-success-subtle px-4 py-1.5 text-body font-semibold text-ink"
        >
          {rsvp.status === 'ATTENDING'
            ? t('notedAttending', { count: rsvp.attendingCount })
            : t('notedNotAttending')}
        </p>
        <p className="text-body text-ink-muted">{t('savedForAll')}</p>
        <Button variant="outline" onClick={startEditing}>
          <PencilIcon width={16} height={16} />
          {t('change')}
        </Button>
        <p className="border-t border-line pt-4 text-body-sm text-ink-muted">
          {deadline ? t('canUpdateUntil', { date: deadline }) : t('canUpdate')}
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="rsvp-title" className={card}>
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <div className="text-center">
          <p className="text-label-sm font-semibold tracking-widest text-secondary-ink uppercase">
            {t('eyebrow')}
          </p>
          <h2 id="rsvp-title" className="mt-2 font-display text-headline-sm text-ink">
            {t('question')}
          </h2>
        </div>

        <fieldset>
          <legend className="sr-only">{t('question')}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { value: true, label: t('yes') },
              { value: false, label: t('no') },
            ].map((option) => (
              <label
                key={String(option.value)}
                className="flex h-13 cursor-pointer items-center justify-center gap-2 rounded-control border border-line bg-canvas-muted px-4 text-body font-semibold text-ink has-checked:border-primary has-checked:bg-primary has-checked:text-on-primary has-focus-visible:outline-2 has-focus-visible:outline-focus"
              >
                <input
                  type="radio"
                  name="attending"
                  checked={attending === option.value}
                  onChange={() => setAttending(option.value)}
                  className="sr-only"
                />
                {attending === option.value && <CheckIcon width={16} height={16} />}
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        {attending && (
          <div className="flex items-center justify-between gap-4 rounded-control bg-canvas-muted p-4">
            <div>
              <p id="count-label" className="text-body font-medium text-ink">
                {t('count')}
              </p>
              <p className="text-body-sm text-ink-muted">{t('countHint', { max: maxPeople })}</p>
            </div>
            <div
              role="group"
              aria-labelledby="count-label"
              className="flex items-center rounded-control border border-line bg-surface"
            >
              <button
                type="button"
                aria-label={t('fewer')}
                onClick={() => setCount((value) => Math.max(1, value - 1))}
                disabled={count <= 1}
                className="flex size-11 items-center justify-center text-ink disabled:opacity-40"
              >
                <MinusIcon width={16} height={16} />
              </button>
              <output aria-live="polite" className="w-8 text-center text-body-lg text-ink">
                {count}
              </output>
              <button
                type="button"
                aria-label={t('more')}
                onClick={() => setCount((value) => Math.min(maxPeople, value + 1))}
                disabled={count >= maxPeople}
                className="flex size-11 items-center justify-center text-ink disabled:opacity-40"
              >
                <PlusIcon width={16} height={16} />
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-body-sm text-ink-muted">{t('appliesToAll')}</p>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? t('sending') : t('submit')}
        </Button>
        {deadline && (
          <p className="flex items-center justify-center gap-1.5 text-body-sm text-ink-muted">
            <CalendarIcon width={16} height={16} className="text-secondary-ink" />
            {t('replyBy', { date: deadline })}
          </p>
        )}
      </form>
    </section>
  );
}
