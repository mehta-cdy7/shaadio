import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PlusIcon, UsersIcon } from '@/components/ui/icons';
import { Eyebrow } from '@/components/ui/typography';
import { currentMember } from '@/app/_lib/current-member';
import { listEvents } from '@/modules/events';
import { countGuests, guestSummary, listGuests } from '@/modules/guests';
import {
  GUESTS_PER_WEDDING,
  guestListQueryInput,
  guestListQuerySchema,
  type GuestListQuery,
} from '@/modules/guests/schemas';
import { GuestFilters } from './_components/guest-filters';
import { GuestStats } from './_components/guest-stats';
import { GuestTable } from './_components/guest-table';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('members.guests');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/** The URL's filters, as `GET /api/guests` reads them. Anything invalid is ignored, not an error. */
function filtersFrom(searchParams: Record<string, string | string[] | undefined>): {
  query: GuestListQuery;
  params: URLSearchParams;
} {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === 'cursor' || key === 'limit') continue;
    for (const item of Array.isArray(value) ? value : value ? [value] : [])
      params.append(key, item);
  }
  const parsed = guestListQuerySchema.safeParse(guestListQueryInput(params));
  return parsed.success
    ? { query: parsed.data, params }
    : { query: {}, params: new URLSearchParams() };
}

/** Guests (PRD §9.7): the numbers, search and filters, and the list by name. */
export default async function GuestsPage({ searchParams }: PageProps<'/app/guests'>) {
  const current = await currentMember();
  if (!current?.member) redirect('/onboarding');
  const scope = { weddingId: current.member.weddingId };
  const t = await getTranslations('members.guests');

  const { query, params } = filtersFrom(await searchParams);
  const [summary, all, events, page, matching] = await Promise.all([
    guestSummary(scope),
    countGuests(scope),
    listEvents(scope),
    listGuests(scope, query),
    countGuests(scope, query),
  ]);
  const full = all >= GUESTS_PER_WEDDING;
  const eventNames = events.map((event) => ({ id: event.id, name: event.name }));

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Eyebrow className="flex items-center gap-2">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-secondary" />
            {t('eyebrow')}
          </Eyebrow>
          <h1 className="mt-2 font-display text-headline-lg-sm text-ink md:text-headline-lg">
            {t('title')}
          </h1>
          <p className="mt-1 text-body-lg text-ink-muted">{t('lead')}</p>
        </div>
        {!full && all > 0 && (
          <ButtonLink href="/app/guests/new" className="self-start sm:self-auto">
            <PlusIcon width={18} height={18} />
            {t('add')}
          </ButtonLink>
        )}
      </header>

      {all === 0 ? (
        <Card className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 py-12 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-primary-subtle text-ink-accent">
            <UsersIcon width={28} height={28} />
          </span>
          <h2 className="font-display text-headline-md text-ink">{t('empty.title')}</h2>
          <p className="max-w-md text-body-lg text-pretty text-ink-muted">{t('empty.body')}</p>
          <ButtonLink href="/app/guests/new" size="lg" className="mt-2">
            <PlusIcon width={18} height={18} />
            {t('empty.cta')}
          </ButtonLink>
          <div className="mt-6 flex max-w-md gap-3 rounded-control bg-canvas-muted p-4 text-left">
            <UsersIcon width={20} height={20} className="mt-0.5 shrink-0 text-secondary-ink" />
            <div>
              <p className="text-body font-semibold text-ink">{t('empty.noteTitle')}</p>
              <p className="text-body text-ink-muted">{t('empty.noteBody')}</p>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <GuestStats summary={summary} />
          <GuestFilters events={eventNames} />
          <GuestTable page={page} total={matching} query={params.toString()} events={eventNames} />
          {full && (
            <p className="text-body text-ink-muted">
              {t('limitReached', { max: GUESTS_PER_WEDDING })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
