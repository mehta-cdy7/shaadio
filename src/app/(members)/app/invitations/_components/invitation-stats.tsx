import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/cn';
import type { GuestSummary } from '@/modules/guests/schemas';

function percent(part: number, whole: number): number {
  return whole ? Math.round((part / whole) * 100) : 0;
}

/**
 * Six progress numbers and the reply bar (Stitch "Guest response pipeline"). Like the Guests page,
 * only guests invited to at least one event count (DATABASE_DESIGN §13.1). "Opened" means the
 * invitation link was opened: emails are never tracked.
 */
export async function InvitationStats({ summary }: { summary: GuestSummary }) {
  const t = await getTranslations('members.invitations.stats');
  const tiles = [
    { key: 'guests', value: summary.invitations, hint: t('guestsHint'), tone: '' },
    {
      key: 'sent',
      value: summary.sent,
      hint: t('sentHint', { percent: percent(summary.sent, summary.invitations) }),
      tone: '',
    },
    {
      key: 'opened',
      value: summary.linkOpened,
      hint: t('openedHint', { percent: percent(summary.linkOpened, summary.invitations) }),
      tone: '',
    },
    {
      key: 'attending',
      value: summary.attending,
      hint: t('attendingHint', { count: summary.peopleAttending }),
      tone: 'border-success/40 bg-success-subtle',
    },
    {
      key: 'declined',
      value: summary.notAttending,
      hint: t('declinedHint'),
      tone: 'border-danger/30 bg-danger-subtle',
    },
    {
      key: 'awaiting',
      value: summary.pending,
      hint: t('awaitingHint'),
      tone: 'border-secondary bg-pending/40',
    },
  ] as const;
  const total = summary.invitations;
  const replied = summary.attending + summary.notAttending;

  return (
    <section
      aria-label={t('label')}
      className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-6"
    >
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((tile) => (
          <li
            key={tile.key}
            className={cn('flex flex-col gap-1 rounded-control border border-line p-4', tile.tone)}
          >
            <span className="text-label font-medium text-ink-muted">{t(tile.key)}</span>
            <span className="font-display text-headline-md text-ink">{tile.value}</span>
            <span className="text-label text-ink-muted">{tile.hint}</span>
          </li>
        ))}
      </ul>
      {total > 0 && (
        <div className="mt-5 flex flex-col gap-2">
          <div
            className="flex h-2 overflow-hidden rounded-full bg-fill"
            role="img"
            aria-label={t('responded', { count: replied, total })}
          >
            <span
              className="bg-success"
              style={{ width: `${percent(summary.attending, total)}%` }}
            />
            <span
              className="bg-danger"
              style={{ width: `${percent(summary.notAttending, total)}%` }}
            />
          </div>
          <p className="text-right text-label text-ink-muted">
            {t('responded', { count: replied, total })}
          </p>
        </div>
      )}
    </section>
  );
}
