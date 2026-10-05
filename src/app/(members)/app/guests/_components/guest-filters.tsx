'use client';

import { useEffect, useState, useTransition, type ComponentProps } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronDownIcon, CloseIcon, SearchIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { RSVP_STATUSES, SEARCH_MAX, SIDES } from '@/modules/guests/schemas';

/** The "Invite" filter is one menu over two API filters, `sent` and `opened`. */
const INVITE_OPTIONS = {
  sent: ['sent', 'true'],
  notSent: ['sent', 'false'],
  opened: ['opened', 'true'],
  notOpened: ['opened', 'false'],
} as const;
type InviteOption = keyof typeof INVITE_OPTIONS;

function inviteOption(params: URLSearchParams): InviteOption | '' {
  for (const [option, [key, value]] of Object.entries(INVITE_OPTIONS)) {
    if (params.get(key) === value) return option as InviteOption;
  }
  return '';
}

const SEARCH_DELAY_MS = 300;

/**
 * Search and filters for the guest list (API_DESIGN §14). They live in the URL, so the server page
 * renders the filtered list, the browser's back button works and a filtered list can be shared.
 */
export function GuestFilters({ events }: { events: Array<{ id: string; name: string }> }) {
  const t = useTranslations('members.guests');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(params.get('search') ?? '');

  function apply(change: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(params);
    next.delete('cursor');
    change(next);
    const query = next.toString();
    startTransition(() =>
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }),
    );
  }

  // Search as the user types, once they pause.
  useEffect(() => {
    if (search.trim() === (params.get('search') ?? '')) return;
    const timer = setTimeout(
      () =>
        apply((next) => {
          if (search.trim()) next.set('search', search.trim());
          else next.delete('search');
        }),
      SEARCH_DELAY_MS,
    );
    return () => clearTimeout(timer);
    // `apply` reads the latest params; re-running on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const side = SIDES.find((value) => value === params.get('side'));
  const eventId = params.get('eventId') ?? '';
  const rsvp = RSVP_STATUSES.find((value) => value === params.get('rsvpStatus'));
  const invite = inviteOption(params);
  const noEvents = params.get('noEvents') === 'true';

  function setOne(key: string, value: string) {
    apply((next) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
  }

  function setInvite(option: InviteOption | '') {
    apply((next) => {
      next.delete('sent');
      next.delete('opened');
      if (option) next.set(INVITE_OPTIONS[option][0], INVITE_OPTIONS[option][1]);
    });
  }

  const eventName = events.find((event) => event.id === eventId)?.name;
  const active: Array<{ key: string; label: string; clear: () => void }> = [
    ...(side
      ? [
          {
            key: 'side',
            label: `${t('filters.side')}: ${t(`sideLong.${side}`)}`,
            clear: () => setOne('side', ''),
          },
        ]
      : []),
    ...(eventName
      ? [
          {
            key: 'event',
            label: `${t('filters.event')}: ${eventName}`,
            clear: () => setOne('eventId', ''),
          },
        ]
      : []),
    ...(rsvp
      ? [
          {
            key: 'rsvp',
            label: `${t('filters.rsvp')}: ${t(`rsvp.${rsvp}`)}`,
            clear: () => setOne('rsvpStatus', ''),
          },
        ]
      : []),
    ...(invite
      ? [
          {
            key: 'invite',
            label: `${t('filters.invite')}: ${t(`filters.${invite}`)}`,
            clear: () => setInvite(''),
          },
        ]
      : []),
    ...(noEvents
      ? [{ key: 'noEvents', label: t('filters.noEvents'), clear: () => setOne('noEvents', '') }]
      : []),
  ];

  return (
    <section
      aria-label={t('filters.label')}
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative block lg:w-72">
          <span className="sr-only">{t('filters.search')}</span>
          <SearchIcon
            width={18}
            height={18}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted"
          />
          <input
            type="search"
            value={search}
            maxLength={SEARCH_MAX}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('filters.searchPlaceholder')}
            className="h-10 w-full rounded-full border border-line bg-canvas-muted pr-4 pl-10 text-body text-ink placeholder:text-ink-muted/70 focus-visible:outline-2 focus-visible:outline-focus"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <FilterSelect
            aria-label={t('filters.side')}
            value={side ?? ''}
            onChange={(event) => setOne('side', event.target.value)}
          >
            <option value="">{`${t('filters.side')}: ${t('filters.all')}`}</option>
            {SIDES.map((value) => (
              <option key={value} value={value}>
                {t(`sideLong.${value}`)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            aria-label={t('filters.event')}
            value={eventId}
            onChange={(event) => setOne('eventId', event.target.value)}
          >
            <option value="">{`${t('filters.event')}: ${t('filters.all')}`}</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            aria-label={t('filters.rsvp')}
            value={rsvp ?? ''}
            onChange={(event) => setOne('rsvpStatus', event.target.value)}
          >
            <option value="">{`${t('filters.rsvp')}: ${t('filters.all')}`}</option>
            {RSVP_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`rsvp.${value}`)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            aria-label={t('filters.invite')}
            value={invite}
            onChange={(event) => setInvite(event.target.value as InviteOption | '')}
          >
            <option value="">{`${t('filters.invite')}: ${t('filters.all')}`}</option>
            {(Object.keys(INVITE_OPTIONS) as InviteOption[]).map((option) => (
              <option key={option} value={option}>
                {t(`filters.${option}`)}
              </option>
            ))}
          </FilterSelect>
          <button
            type="button"
            aria-pressed={noEvents}
            onClick={() => setOne('noEvents', noEvents ? '' : 'true')}
            className={cn(
              'flex h-10 items-center gap-2 rounded-full border px-4 text-body transition-colors focus-visible:outline-2 focus-visible:outline-focus',
              noEvents
                ? 'border-primary bg-primary-subtle text-ink'
                : 'border-line bg-surface text-ink hover:bg-fill',
            )}
          >
            <span aria-hidden="true" className="size-1.5 rounded-full bg-secondary" />
            {t('filters.noEvents')}
          </button>
        </div>
      </div>

      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {active.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={filter.clear}
              aria-label={t('filters.remove', { filter: filter.label })}
              className="flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-label font-semibold text-on-primary-soft hover:opacity-90 focus-visible:outline-2 focus-visible:outline-focus"
            >
              {filter.label}
              <CloseIcon width={14} height={14} />
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setSearch('');
              apply((next) => {
                for (const key of ['side', 'eventId', 'rsvpStatus', 'sent', 'opened', 'noEvents']) {
                  next.delete(key);
                }
              });
            }}
            className="ml-1 text-label font-semibold text-ink underline underline-offset-4 hover:text-ink-accent"
          >
            {t('filters.clear')}
          </button>
        </div>
      )}
    </section>
  );
}

/** A native select styled as a filter chip: accessible and light on a phone. */
function FilterSelect(props: ComponentProps<'select'>) {
  return (
    <span className="relative">
      <select
        {...props}
        className="h-10 cursor-pointer appearance-none rounded-full border border-line bg-surface pr-9 pl-4 text-body text-ink hover:bg-fill focus-visible:outline-2 focus-visible:outline-focus"
      />
      <ChevronDownIcon
        width={16}
        height={16}
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted"
      />
    </span>
  );
}
