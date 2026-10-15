import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CalendarIcon } from '@/components/ui/icons';
import { currentMember } from '@/app/_lib/current-member';
import { coupleNames } from '@/lib/couple';
import { formatCalendarDate } from '@/lib/dates';
import { guestSummary, listGuests } from '@/modules/guests';
import { listCampaigns, queueableGuestCount, queuedGuestIds } from '@/modules/invitations';
import { getWedding } from '@/modules/weddings';
import { campaignEmailsPerDay } from '@/server/email/quota';
import { AwaitingList } from './_components/awaiting-list';
import { CampaignProgress } from './_components/campaign-progress';
import { EmailInvitationsCard } from './_components/email-invitations-card';
import { InvitationStats } from './_components/invitation-stats';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('members.invitations');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/**
 * Invitations & RSVPs (PRD §9.12–9.14, Stitch "Invitations & RSVPs"): progress numbers, queue the
 * invitation emails, follow their progress, and nudge guests who haven't replied on WhatsApp.
 * Same services as the API (API-08). RSVP email reminders are V2 (PRD §9.13).
 */
export default async function InvitationsPage() {
  const current = await currentMember();
  if (!current?.member) redirect('/onboarding');
  const scope = { weddingId: current.member.weddingId };
  const t = await getTranslations('members.invitations');

  const [summary, campaigns, wedding, pending, queueable, queued] = await Promise.all([
    guestSummary(scope),
    listCampaigns(scope),
    getWedding(scope),
    listGuests(scope, { rsvpStatus: ['PENDING'], noEvents: false, limit: 20 }),
    queueableGuestCount(scope),
    queuedGuestIds(scope),
  ]);

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <header className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-headline-lg-sm text-ink md:text-headline-lg">
            {t('title')}
          </h1>
          <p className="mt-1 text-body-lg text-ink-muted">{t('lead')}</p>
        </div>
        {wedding.rsvpDeadline && (
          <p className="inline-flex items-center gap-2 self-start rounded-full border border-line bg-surface px-4 py-2 text-body font-medium text-ink shadow-card sm:self-auto">
            <CalendarIcon width={16} height={16} className="text-ink-accent" />
            {t('replyBy', { date: formatCalendarDate(wedding.rsvpDeadline) })}
          </p>
        )}
      </header>

      <InvitationStats summary={summary} />

      <div className="grid gap-6 lg:grid-cols-2">
        <EmailInvitationsCard
          ready={queueable}
          queued={queued.length}
          perDay={campaignEmailsPerDay()}
        />
        <CampaignProgress campaigns={campaigns.items} />
      </div>

      <AwaitingList
        initial={pending}
        queued={queued}
        couple={coupleNames(current.member.wedding)}
        allReplied={summary.invitations > 0 && summary.pending === 0}
      />
    </div>
  );
}
