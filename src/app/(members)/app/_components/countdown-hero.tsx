import { getTranslations } from 'next-intl/server';
import { HeartIcon, MapPinIcon } from '@/components/ui/icons';
import { coupleNames } from '@/lib/couple';
import { formatCalendarDate } from '@/lib/dates';

/** Days to go (PRD §9.3 "Wedding Countdown") on the plum band, with the couple's card beside it. */
export async function CountdownHero({
  daysToGo,
  wedding,
}: {
  daysToGo: number;
  wedding: {
    brideName: string;
    groomName: string;
    nameOrder?: 'BRIDE_FIRST' | 'GROOM_FIRST';
    weddingDate: string;
    location: { city: string; state?: string | null };
  };
}) {
  const t = await getTranslations('members.dashboard');
  const tc = await getTranslations('members.countdown');
  const [first, second] = coupleNames(wedding);
  const place = [wedding.location.city, wedding.location.state].filter(Boolean).join(', ');

  return (
    <section
      aria-labelledby="countdown-heading"
      className="relative overflow-hidden rounded-card bg-band p-6 text-on-band shadow-float sm:p-10"
    >
      {/* Concentric arches, echoing the logo's jharokha. */}
      <svg
        viewBox="0 0 400 400"
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 right-0 h-[28rem] w-[28rem] text-on-band/10"
        fill="none"
        stroke="currentColor"
      >
        <path d="M60 400V200a140 140 0 0 1 280 0v200" />
        <path d="M110 400V210a90 90 0 0 1 180 0v190" />
      </svg>

      <div className="relative flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-5">
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-on-band/20 px-3 py-1 text-label-sm font-semibold tracking-widest text-secondary uppercase">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-secondary" />
            {t('countdownEyebrow')}
          </p>
          <h2 id="countdown-heading" className="flex flex-wrap items-baseline gap-x-4 font-display">
            {daysToGo > 0 ? (
              <>
                <span className="text-countdown">{daysToGo}</span>
                <span className="text-headline-lg text-secondary italic">
                  {tc('unit', { days: daysToGo })}
                </span>
              </>
            ) : (
              <span className="text-headline-lg">
                {daysToGo === 0 ? tc('today') : tc('past', { days: -daysToGo })}
              </span>
            )}
          </h2>
          <p className="flex items-center gap-2 text-body-lg text-on-band-muted">
            <MapPinIcon width={18} height={18} className="shrink-0 text-secondary" />
            {formatCalendarDate(wedding.weddingDate, 'full')} · {place}
          </p>
        </div>

        <div className="hidden w-64 shrink-0 flex-col items-center gap-3 rounded-card border border-on-band/15 bg-on-band/5 px-6 py-7 text-center md:flex">
          <span className="flex size-12 items-center justify-center rounded-full border border-secondary/60 text-secondary">
            <HeartIcon width={20} height={20} />
          </span>
          <p className="text-label-sm font-semibold tracking-widest text-secondary uppercase">
            {t('weddingOf')}
          </p>
          <p className="font-display text-headline-sm">
            {first} &amp; {second}
          </p>
          <span aria-hidden="true" className="h-px w-12 bg-secondary/60" />
          <p className="text-label-sm tracking-widest text-on-band-muted uppercase">{place}</p>
        </div>
      </div>
    </section>
  );
}
