'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertIcon, ChevronDownIcon, EyeIcon, MailIcon } from '@/components/ui/icons';
import { useApiErrorMessage } from '@/components/ui/use-api-error';
import { getJson } from '@/lib/api';
import { formatPhone } from '@/lib/phone';
import type { GuestListResponse, GuestResponse } from '@/modules/guests/schemas';
import { GuestActions } from './guest-actions';
import { RsvpBadge } from './rsvp-badge';
import { useRsvpLabel } from './rsvp-label';

const TAGS_SHOWN = 3;

/** Side pill colours follow the Stitch list: bride pink, groom brass, both neutral. */
const SIDE_TONE = { BRIDE: 'soft', GROOM: 'pending', BOTH: 'neutral' } as const;

/**
 * The guest list (Stitch "Guests List"): a table from tablet width, cards on phones. The first page
 * comes from the server; "Load more" fetches the next with the cursor (API_DESIGN §5.2).
 */
export function GuestTable({
  page,
  total,
  query,
  events,
}: {
  page: GuestListResponse;
  /** Guests matching the current filters. */
  total: number;
  /** The current filters as URL parameters, for the next pages. */
  query: string;
  events: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations('members.guests');
  const errorMessage = useApiErrorMessage();
  const [first, setFirst] = useState(page);
  const [items, setItems] = useState(page.items);
  const [cursor, setCursor] = useState(page.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  // A new first page (filters changed, or a refresh after an edit) starts the list again.
  if (first !== page) {
    setFirst(page);
    setItems(page.items);
    setCursor(page.nextCursor);
    setError(undefined);
  }

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    setError(undefined);
    const params = new URLSearchParams(query);
    params.set('cursor', cursor);
    const result = await getJson<GuestListResponse>(`/api/guests?${params}`);
    setLoading(false);
    if (result.ok) {
      setItems((prev) => [...prev, ...result.data.items]);
      setCursor(result.data.nextCursor);
    } else {
      setError(result.code === 'VALIDATION_ERROR' ? t('table.listChanged') : errorMessage(result));
    }
  }

  const eventNames = new Map(events.map((event) => [event.id, event.name]));

  if (!items.length) {
    return (
      <p className="rounded-card border border-line bg-surface p-8 text-center text-body-lg text-ink-muted shadow-card">
        {t('table.noMatches')}
      </p>
    );
  }

  return (
    <div className="rounded-card border border-line bg-surface shadow-card">
      {/* Tablet and up: a table. */}
      <table className="hidden w-full text-left md:table">
        <caption className="sr-only">{t('table.label')}</caption>
        <thead className="bg-canvas-muted [&_th:first-child]:rounded-tl-card [&_th:last-child]:rounded-tr-card text-label-sm font-semibold tracking-widest text-ink-muted uppercase">
          <tr>
            <th scope="col" className="px-5 py-4">
              {t('table.guest')}
            </th>
            <th scope="col" className="hidden px-3 py-4 lg:table-cell">
              {t('table.side')}
            </th>
            <th scope="col" className="px-3 py-4">
              {t('table.events')}
            </th>
            <th scope="col" className="hidden px-3 py-4 xl:table-cell">
              {t('table.capacity')}
            </th>
            <th scope="col" className="px-3 py-4">
              {t('table.rsvp')}
            </th>
            <th scope="col" className="hidden px-3 py-4 lg:table-cell">
              {t('table.invite')}
            </th>
            <th scope="col" className="w-14 px-3 py-4">
              <span className="sr-only">{t('table.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((guest) => (
            <tr key={guest.id} className="align-middle hover:bg-canvas-muted/60">
              <td className="px-5 py-4">
                <GuestName guest={guest} />
              </td>
              <td className="hidden px-3 py-4 lg:table-cell">
                <SidePill guest={guest} />
              </td>
              <td className="px-3 py-4">
                <EventTags ids={guest.invitedEventIds} names={eventNames} />
              </td>
              <td className="hidden px-3 py-4 text-body whitespace-nowrap text-ink xl:table-cell">
                {t('people', { count: guest.maxPeople })}
              </td>
              <td className="px-3 py-4">
                <GuestRsvp guest={guest} />
              </td>
              <td className="hidden px-3 py-4 lg:table-cell">
                <InviteStatus guest={guest} />
              </td>
              <td className="px-3 py-4">
                <GuestActions guest={guest} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Phones: cards. */}
      <ul aria-label={t('table.label')} className="divide-y divide-line md:hidden">
        {items.map((guest) => (
          <li key={guest.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <GuestName guest={guest} />
              <GuestActions guest={guest} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <GuestRsvp guest={guest} />
              {guest.side && <SidePill guest={guest} />}
              <span className="text-label text-ink-muted">
                {t('people', { count: guest.maxPeople })}
              </span>
            </div>
            <EventTags ids={guest.invitedEventIds} names={eventNames} />
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3 border-t border-line bg-canvas-muted px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" className="text-body text-ink-muted">
          {t('table.showing', { shown: items.length, total: Math.max(total, items.length) })}
        </p>
        {error && <Alert className="sm:order-last sm:basis-full">{error}</Alert>}
        {cursor && (
          <Button variant="outline" onClick={loadMore} disabled={loading}>
            {loading ? t('table.loading') : t('table.loadMore')}
            <ChevronDownIcon width={16} height={16} />
          </Button>
        )}
      </div>
    </div>
  );
}

function GuestName({ guest }: { guest: GuestResponse }) {
  const t = useTranslations('members.guests.table');
  const contact = guest.phone ? formatPhone(guest.phone) : guest.email;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-subtle font-display text-title text-ink-accent"
      >
        {guest.name.trim().charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0">
        <Link
          href={`/app/guests/${guest.id}`}
          className="block font-medium break-words text-ink hover:underline"
        >
          {guest.name}
        </Link>
        {contact ? (
          <p className="truncate text-label text-ink-muted">{contact}</p>
        ) : (
          <p className="text-label text-ink-muted italic">{t('noContact')}</p>
        )}
      </div>
    </div>
  );
}

function SidePill({ guest }: { guest: GuestResponse }) {
  const t = useTranslations('members.guests.sides');
  if (!guest.side) return <span className="text-ink-muted">—</span>;
  return (
    <Badge size="sm" tone={SIDE_TONE[guest.side]} dot>
      {t(guest.side)}
    </Badge>
  );
}

function EventTags({ ids, names }: { ids: string[]; names: Map<string, string> }) {
  const t = useTranslations('members.guests.table');
  const known = ids.map((id) => names.get(id)).filter((name): name is string => Boolean(name));
  if (!known.length) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-control bg-pending px-2.5 py-1 text-label-sm font-semibold text-on-pending">
        <AlertIcon width={14} height={14} />
        {t('noEvents')}
      </span>
    );
  }
  const extra = known.length - TAGS_SHOWN;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {known.slice(0, TAGS_SHOWN).map((name) => (
        <li key={name} className="rounded-control bg-fill px-2 py-0.5 text-label text-ink">
          {name}
        </li>
      ))}
      {extra > 0 && (
        <li className="rounded-control bg-fill px-2 py-0.5 text-label font-semibold text-ink-muted">
          {t('more', { count: extra })}
        </li>
      )}
    </ul>
  );
}

function GuestRsvp({ guest }: { guest: GuestResponse }) {
  const rsvpLabel = useRsvpLabel();
  return <RsvpBadge status={guest.rsvp.status} label={rsvpLabel(guest.rsvp)} />;
}

function InviteStatus({ guest }: { guest: GuestResponse }) {
  const t = useTranslations('members.guests.table');
  if (guest.linkOpenedAt) {
    return (
      <span className="flex items-center gap-1.5 text-body text-ink">
        <EyeIcon width={16} height={16} />
        {t('opened')}
      </span>
    );
  }
  return (
    <span
      className={`flex items-center gap-1.5 text-body ${guest.delivery ? 'text-ink' : 'text-ink-muted'}`}
    >
      <MailIcon width={16} height={16} />
      {guest.delivery ? t('sent') : t('notSent')}
    </span>
  );
}
