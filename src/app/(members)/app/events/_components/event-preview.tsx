'use client';

import { useTranslations } from 'next-intl';
import { ClockIcon, ExternalLinkIcon, MapPinIcon } from '@/components/ui/icons';
import { Eyebrow } from '@/components/ui/typography';
import { cn } from '@/lib/cn';
import { formatCalendarDate, formatTimeRange, isCalendarDate } from '@/lib/dates';
import type { EventFormValues } from './event-form-values';

function isHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** How the event will look on a guest's invitation, updated as the form is filled in. */
export function EventPreview({ values, couple }: { values: EventFormValues; couple: string }) {
  const t = useTranslations('members.events.preview');
  const name = values.name.trim();
  const hasDate = isCalendarDate(values.date);
  const time = formatTimeRange(values.startTime || undefined, values.endTime || undefined);
  const place = [values.venueName.trim(), values.venueAddress.trim()].filter(Boolean).join(' · ');
  const dressCode = values.dressCode.trim();
  const mapUrl = values.mapUrl.trim();

  return (
    <section aria-label={t('label')} className="flex w-full flex-col items-center gap-5">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-label-sm font-semibold tracking-widest text-secondary-ink uppercase">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-secondary" />
        {t('label')}
      </span>
      <div className="w-full rounded-card border border-line bg-surface px-6 py-8 text-center shadow-float">
        <svg
          viewBox="0 0 120 64"
          width={80}
          height={44}
          fill="none"
          aria-hidden="true"
          className="mx-auto mb-4"
        >
          <path d="M14 62V48a46 46 0 0 1 92 0v14" className="stroke-secondary" strokeWidth={1.5} />
          <circle cx={60} cy={3} r={3} className="fill-secondary" />
        </svg>
        <Eyebrow>{t('eyebrow', { couple })}</Eyebrow>
        <p
          className={cn(
            'mt-3 font-display text-headline-md',
            name ? 'text-ink' : 'text-ink-muted/60',
          )}
        >
          {name || t('namePlaceholder')}
        </p>
        <span aria-hidden="true" className="mx-auto my-4 block h-px w-12 bg-secondary/60" />
        <div className="flex flex-col items-center gap-2 text-body text-ink">
          <p className={cn('flex items-start gap-2', !hasDate && 'text-ink-muted/60')}>
            <ClockIcon width={16} height={16} className="mt-0.5 shrink-0 text-secondary-ink" />
            <span>
              {hasDate ? formatCalendarDate(values.date, 'full') : t('datePlaceholder')}
              {time && ` · ${time}`}
            </span>
          </p>
          {place && (
            <p className="flex items-start gap-2">
              <MapPinIcon width={16} height={16} className="mt-0.5 shrink-0 text-secondary-ink" />
              <span>{place}</span>
            </p>
          )}
        </div>
        {dressCode && (
          <p className="mt-4 inline-flex rounded-full bg-pending px-3 py-1 text-label font-semibold text-on-pending">
            {t('dressCode', { dressCode })}
          </p>
        )}
        {isHttpUrl(mapUrl) && (
          <p className="mt-4">
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-body font-medium text-ink-accent hover:underline"
            >
              {t('openMaps')}
              <ExternalLinkIcon width={14} height={14} />
            </a>
          </p>
        )}
      </div>
      <p className="text-center text-body text-ink-muted italic">{t('caption')}</p>
    </section>
  );
}
