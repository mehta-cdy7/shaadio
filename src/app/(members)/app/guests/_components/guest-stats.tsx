import type { ComponentType, ReactNode, SVGProps } from 'react';
import { getTranslations } from 'next-intl/server';
import { AlertIcon, CheckCircleIcon, ClockIcon, MailIcon, UsersIcon } from '@/components/ui/icons';
import type { GuestSummary } from '@/modules/guests/schemas';

function Stat({
  label,
  icon: Icon,
  children,
  note,
}: {
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  children: ReactNode;
  note: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-label-sm font-semibold tracking-widest text-ink-muted uppercase">
          {label}
        </h3>
        <Icon width={20} height={20} className="shrink-0 text-ink-accent" />
      </div>
      <p className="flex items-baseline gap-2 font-display text-headline-lg text-ink">{children}</p>
      <div className="mt-auto text-body-sm text-ink-muted">{note}</div>
    </li>
  );
}

/**
 * The four guest numbers above the list (DATABASE_DESIGN §13.1). Guests invited to no event are
 * left out of all of them, and flagged below.
 */
export async function GuestStats({ summary }: { summary: GuestSummary }) {
  const t = await getTranslations('members.guests.stats');
  return (
    <section aria-label={t('label')} className="flex flex-col gap-3">
      <ul className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label={t('invitations')} icon={MailIcon} note={t('invitationsNote')}>
          {summary.invitations}
        </Stat>
        <Stat label={t('people')} icon={UsersIcon} note={t('peopleNote')}>
          {summary.peopleInvited}
        </Stat>
        <Stat
          label={t('attending')}
          icon={CheckCircleIcon}
          note={
            <span className="inline-flex rounded-full bg-success-subtle px-2.5 py-0.5 text-label font-semibold text-success">
              {t('attendingNote', { count: summary.peopleAttending })}
            </span>
          }
        >
          {summary.attending}
          <span className="font-sans text-body-lg text-ink-muted">
            {t('attendingValue', { count: summary.attending })}
          </span>
        </Stat>
        <Stat
          label={t('notAttending')}
          icon={ClockIcon}
          note={
            <span className="inline-flex rounded-full bg-fill px-2.5 py-0.5 text-label font-semibold text-ink-muted">
              {t('pendingNote', { count: summary.pending })}
            </span>
          }
        >
          {summary.notAttending}
          <span className="font-sans text-body-lg text-ink-muted">{t('notAttendingValue')}</span>
        </Stat>
      </ul>
      {summary.notInvitedToAnyEvent > 0 && (
        <p className="flex items-center gap-2 rounded-control bg-pending px-4 py-2.5 text-body text-on-pending">
          <AlertIcon width={16} height={16} className="shrink-0" />
          {t('noEvents', { count: summary.notInvitedToAnyEvent })}
        </p>
      )}
    </section>
  );
}
