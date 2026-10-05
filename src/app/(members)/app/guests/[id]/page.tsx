import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeftIcon, ClockIcon, MapPinIcon, PencilIcon } from '@/components/ui/icons';
import { currentMember } from '@/app/_lib/current-member';
import { formatCalendarDate, formatTimeRange } from '@/lib/dates';
import { formatPhone } from '@/lib/phone';
import { listEvents } from '@/modules/events';
import { getGuest } from '@/modules/guests';
import { GuestActions } from '../_components/guest-actions';
import { InviteLinkCard } from '../_components/invite-link-card';
import { RsvpCard } from '../_components/rsvp-card';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('members.guests.detail');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/**
 * One guest (Stitch "Guest Detail"): details, invited events, RSVP and the invitation link. The
 * only member page that shows the link (API_DESIGN §14, §29). Another wedding's id is a 404.
 */
export default async function GuestPage({ params }: PageProps<'/app/guests/[id]'>) {
  const current = await currentMember();
  if (!current?.member) redirect('/onboarding');
  const scope = { weddingId: current.member.weddingId };
  const { id } = await params;
  const [guest, events] = await Promise.all([
    getGuest(scope, id).catch((error: unknown) => {
      if ((error as { code?: string }).code === 'NOT_FOUND') notFound();
      throw error;
    }),
    listEvents(scope),
  ]);
  const t = await getTranslations('members.guests');
  const invited = events.filter((event) => guest.invitedEventIds.includes(event.id));

  const detail = (label: string, value?: string) => (
    <div>
      <dt className="text-label-sm font-semibold tracking-widest text-ink-muted uppercase">
        {label}
      </dt>
      <dd
        className={
          value ? 'mt-1 text-body-lg break-words text-ink' : 'mt-1 text-body text-ink-muted italic'
        }
      >
        {value ?? t('detail.none')}
      </dd>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/app/guests"
          className="inline-flex items-center gap-1.5 text-body text-ink-muted hover:text-ink"
        >
          <ArrowLeftIcon width={16} height={16} />
          {t('form.back')}
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="font-display text-headline-lg-sm break-words text-ink md:text-headline-lg">
              {guest.name}
            </h1>
            {guest.side && (
              <Badge tone="soft" dot>
                {t(`sideLong.${guest.side}`)}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ButtonLink href={`/app/guests/${guest.id}/edit`} variant="outline">
              <PencilIcon width={16} height={16} />
              {t('detail.edit')}
            </ButtonLink>
            <GuestActions guest={guest} onDetail />
          </div>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-5">
            <h2 className="font-display text-headline-sm text-ink">{t('detail.details')}</h2>
            <dl className="grid gap-5 sm:grid-cols-2">
              {detail(t('detail.phone'), guest.phone && formatPhone(guest.phone))}
              {detail(t('detail.email'), guest.email)}
              {detail(t('detail.allowed'), t('upTo', { count: guest.maxPeople }))}
            </dl>
            {guest.notes && (
              <div className="rounded-control bg-canvas-muted p-4">
                <p className="text-label-sm font-semibold tracking-widest text-ink-muted uppercase">
                  {t('detail.notes')}
                </p>
                <p className="mt-1 text-body-lg whitespace-pre-line text-ink">{guest.notes}</p>
              </div>
            )}
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="font-display text-headline-sm text-ink">
              {t('detail.events', { count: invited.length })}
            </h2>
            {invited.length === 0 ? (
              <p className="rounded-control bg-pending px-4 py-3 text-body text-on-pending">
                {t('detail.noEvents')}
              </p>
            ) : (
              <ol className="flex flex-col gap-3">
                {invited.map((event) => (
                  <li
                    key={event.id}
                    className="flex flex-col gap-1 rounded-control border border-line p-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-display text-title text-ink">{event.name}</span>
                      <span className="text-label font-semibold tracking-wide text-secondary-ink uppercase">
                        {formatCalendarDate(event.date)}
                      </span>
                    </div>
                    <p className="flex flex-wrap gap-x-4 gap-y-1 text-body text-ink-muted">
                      <span className="flex items-center gap-1.5">
                        <ClockIcon width={16} height={16} className="shrink-0" />
                        {formatTimeRange(event.startTime, event.endTime) ?? t('detail.timeTba')}
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <MapPinIcon width={16} height={16} className="shrink-0" />
                        <span className="truncate">
                          {event.venue?.name ?? t('detail.venueTba')}
                        </span>
                      </span>
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <RsvpCard guest={guest} />
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-8">
          <InviteLinkCard guest={guest} />
        </aside>
      </div>
    </div>
  );
}
