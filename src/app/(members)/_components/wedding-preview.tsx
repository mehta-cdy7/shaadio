'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { HeartIcon } from '@/components/ui/icons';
import { Eyebrow } from '@/components/ui/typography';
import { coupleNames } from '@/lib/couple';
import { daysBetween, formatCalendarDate, isCalendarDate, todayIn } from '@/lib/dates';
import { cn } from '@/lib/cn';
import { DEFAULT_TIMEZONE, type NameOrder } from '@/modules/weddings/schemas';

export type PreviewValues = {
  brideName: string;
  groomName: string;
  nameOrder: NameOrder;
  weddingDate: string;
  city: string;
  state: string;
};

/**
 * The couple's card as family will see it, updated as the form is typed into (Stitch "Create your
 * wedding"). Empty fields show muted placeholders so the card keeps its shape.
 */
export function WeddingPreview({ values }: { values: PreviewValues }) {
  const t = useTranslations('members.weddingForm.preview');
  const tc = useTranslations('members.countdown');

  const [first, second] = coupleNames({
    brideName: values.brideName.trim(),
    groomName: values.groomName.trim(),
    nameOrder: values.nameOrder,
  });
  const [firstPlaceholder, secondPlaceholder] = coupleNames({
    brideName: t('bride'),
    groomName: t('groom'),
    nameOrder: values.nameOrder,
  });
  const hasDate = isCalendarDate(values.weddingDate);
  const daysToGo = hasDate ? daysBetween(todayIn(DEFAULT_TIMEZONE), values.weddingDate) : undefined;
  const city = [values.city.trim(), values.state.trim()].filter(Boolean).join(', ');

  return (
    <div className="w-full rounded-card border border-line bg-surface px-6 py-8 text-center shadow-float sm:px-10">
      <svg
        viewBox="0 0 120 64"
        width={96}
        height={52}
        fill="none"
        aria-hidden="true"
        className="mx-auto mb-4"
      >
        <path d="M14 62V48a46 46 0 0 1 92 0v14" className="stroke-secondary" strokeWidth={1.5} />
        <circle cx={60} cy={3} r={3} className="fill-secondary" />
      </svg>
      <Eyebrow>{t('eyebrow')}</Eyebrow>
      <p className="mt-3 flex flex-wrap items-center justify-center gap-x-3 font-display text-headline-lg-sm text-ink sm:text-headline-lg">
        <span className={cn(!first && 'text-ink-muted/60')}>{first || firstPlaceholder}</span>
        <HeartIcon width={18} height={18} className="fill-ink-accent text-ink-accent" />
        <span className={cn(!second && 'text-ink-muted/60')}>{second || secondPlaceholder}</span>
      </p>
      <p className={cn('mt-3 text-title', hasDate ? 'text-ink' : 'text-ink-muted/60')}>
        {hasDate ? formatCalendarDate(values.weddingDate) : t('date')}
      </p>
      <p className={cn('mt-1 text-body', city ? 'text-ink-muted' : 'text-ink-muted/60')}>
        {city || t('city')}
      </p>
      <span aria-hidden="true" className="mx-auto my-5 block h-px w-16 bg-line" />
      {daysToGo !== undefined && daysToGo >= 0 ? (
        <Badge tone="pending" dot>
          {tc('pill', { days: daysToGo })}
        </Badge>
      ) : (
        // Keeps the card the same height before a date is chosen.
        <span aria-hidden="true" className="block h-7" />
      )}
    </div>
  );
}
