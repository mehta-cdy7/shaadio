'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink, buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChatIcon, CheckCircleIcon, EyeIcon, MailIcon } from '@/components/ui/icons';
import { getJson, postJson } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { GuestListResponse, GuestResponse } from '@/modules/guests/schemas';
import { useShareGuest, type CoupleNames } from '../../guests/_components/whatsapp-share';
import { useInvitationErrorMessage } from './invitation-errors';

const FILTERS = {
  all: '',
  notSent: 'sent=false',
  notOpened: 'sent=true&opened=false',
  opened: 'opened=true',
} as const;
type Filter = keyof typeof FILTERS;

function formatInstant(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(iso));
}

/**
 * Guests who haven't replied (PRD §9.13 V1): filter by delivery, then nudge on WhatsApp or email
 * the invitation. Pages through `GET /api/guests` with the same filters as the Guests page.
 */
export function AwaitingList({
  initial,
  queued,
  couple,
  allReplied,
}: {
  initial: GuestListResponse;
  queued: string[];
  couple: CoupleNames;
  allReplied: boolean;
}) {
  const t = useTranslations('members.invitations.awaiting');
  const errorMessage = useInvitationErrorMessage();
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  // A refresh after a change elsewhere brings a new first page for the default filter.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    if (filter === 'all') {
      setItems(initial.items);
      setCursor(initial.nextCursor);
    }
  }

  async function load(next: Filter, after?: string) {
    setLoading(true);
    setError(undefined);
    const query = [
      'rsvpStatus=PENDING',
      'noEvents=false',
      'limit=20',
      FILTERS[next],
      after ? `cursor=${encodeURIComponent(after)}` : '',
    ]
      .filter(Boolean)
      .join('&');
    const result = await getJson<GuestListResponse>(`/api/guests?${query}`);
    setLoading(false);
    if (!result.ok) {
      setError(errorMessage(result));
      return;
    }
    setItems((current) => (after ? [...current, ...result.data.items] : result.data.items));
    setCursor(result.data.nextCursor);
  }

  function choose(next: Filter) {
    setFilter(next);
    void load(next);
  }

  if (allReplied) {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <span aria-hidden className="text-headline-sm text-secondary-ink">
          ✦
        </span>
        <h2 className="font-display text-headline-md text-ink">{t('allReplied')}</h2>
        <p className="max-w-md text-body text-ink-muted">{t('allRepliedBody')}</p>
        <ButtonLink href="/app/guests" variant="outline" className="mt-2">
          {t('toGuests')}
        </ButtonLink>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4" id="awaiting">
      <div>
        <h2 className="font-display text-headline-sm text-ink">{t('title')}</h2>
        <p className="mt-1 text-body text-ink-muted">{t('lead')}</p>
      </div>
      <div role="group" aria-label={t('filtersLabel')} className="flex flex-wrap gap-2">
        {(Object.keys(FILTERS) as Filter[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => choose(key)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-label font-medium transition-colors focus-visible:outline-2 focus-visible:outline-focus',
              filter === key
                ? 'border-primary bg-primary text-on-primary'
                : 'border-line bg-surface text-ink hover:border-primary',
            )}
          >
            {t(`filters.${key}`)}
          </button>
        ))}
      </div>
      {error && <Alert>{error}</Alert>}
      {items.length === 0 && !loading ? (
        <p className="rounded-control bg-canvas-muted px-4 py-5 text-center text-body text-ink-muted">
          {t('empty')}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line border-t border-line">
          {items.map((guest) => (
            <AwaitingRow
              key={guest.id}
              guest={guest}
              queued={queued.includes(guest.id)}
              couple={couple}
              onChanged={() => {
                // "All pending" gets a new first page from the refresh; other filters reload.
                if (filter !== 'all') void load(filter);
              }}
            />
          ))}
        </ul>
      )}
      {cursor && (
        <Button
          variant="outline"
          onClick={() => load(filter, cursor)}
          disabled={loading}
          className="self-center"
        >
          {loading ? t('loading') : t('loadMore')}
        </Button>
      )}
    </Card>
  );
}

function AwaitingRow({
  guest: initial,
  queued,
  couple,
  onChanged,
}: {
  guest: GuestResponse;
  queued: boolean;
  couple: CoupleNames;
  onChanged: () => void;
}) {
  const t = useTranslations('members.invitations.awaiting');
  const errorMessage = useInvitationErrorMessage();
  const router = useRouter();
  const shareGuest = useShareGuest(couple);
  const [guest, setGuest] = useState(initial);
  // A refresh or reload brings fresh data for this guest; it replaces the local copy.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setGuest(initial);
  }
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function share() {
    setError(undefined);
    const failure = await shareGuest(guest);
    if (failure) setError(errorMessage(failure));
    else if (!guest.delivery) {
      router.refresh();
      onChanged();
    }
  }

  async function email() {
    setPending(true);
    setError(undefined);
    const result = await postJson<GuestResponse>(
      `/api/guests/${guest.id}/send-invitation-email`,
      {},
    );
    setPending(false);
    if (!result.ok) {
      setError(errorMessage(result));
      return;
    }
    setGuest(result.data);
    router.refresh();
    onChanged();
  }

  return (
    <li className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <Link
            href={`/app/guests/${guest.id}`}
            className="truncate text-title font-medium text-ink hover:underline"
          >
            {guest.name}
          </Link>
          <Badge size="sm" tone={guest.linkOpenedAt ? 'success' : 'neutral'}>
            {guest.linkOpenedAt && <EyeIcon width={12} height={12} />}
            {guest.linkOpenedAt ? t('opened') : t('notOpened')}
          </Badge>
        </p>
        <p className="mt-1 text-label text-ink-muted">
          {t('events', { count: guest.invitedEventIds.length })} ·{' '}
          {guest.delivery
            ? t(`sentVia.${guest.delivery.sentVia}`, { date: formatInstant(guest.delivery.sentAt) })
            : queued
              ? t('queued')
              : t('notSent')}
          {!guest.email && <span className="text-danger"> · {t('noEmail')}</span>}
        </p>
        {error && <Alert className="mt-2">{error}</Alert>}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button type="button" onClick={share} className={buttonClasses()}>
          <ChatIcon width={16} height={16} />
          {t('whatsapp')}
        </button>
        {guest.email &&
          !(queued && !guest.delivery) &&
          (guest.delivery?.sentVia === 'EMAIL' ? (
            <span className="inline-flex items-center gap-1.5 px-2 text-label font-medium text-success">
              <CheckCircleIcon width={14} height={14} />
              {t('emailed')}
            </span>
          ) : (
            <Button variant="outline" onClick={email} disabled={pending}>
              <MailIcon width={16} height={16} />
              {pending ? t('emailing') : t('email')}
            </Button>
          ))}
        <ButtonLink href={`/app/guests/${guest.id}`} variant="ghost">
          {t('view')}
        </ButtonLink>
      </div>
    </li>
  );
}
