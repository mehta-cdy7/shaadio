import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CalendarIcon, MailIcon, UsersIcon } from '@/components/ui/icons';

const STEPS = [
  { key: 'events', href: '/app/events', icon: CalendarIcon },
  { key: 'guests', href: '/app/guests', icon: UsersIcon },
  { key: 'members', href: '/app/settings/members', icon: MailIcon },
] as const;

/** First steps for a new wedding. Shown until it has events or guests. */
export async function GetStarted() {
  const t = await getTranslations('members.dashboard.getStarted');

  return (
    <Card className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-headline-md text-ink">{t('title')}</h2>
        <p className="mt-1 text-body-lg text-ink-muted">{t('lead')}</p>
      </div>
      <ol className="flex flex-col gap-3">
        {STEPS.map(({ key, href, icon: Icon }) => (
          <li
            key={key}
            className="flex flex-col gap-4 rounded-control bg-canvas-muted p-4 sm:flex-row sm:items-center"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft">
              <Icon width={20} height={20} />
            </span>
            <div className="flex-1">
              <h3 className="text-title font-semibold text-ink">{t(`${key}.title`)}</h3>
              <p className="text-body text-ink-muted">{t(`${key}.body`)}</p>
            </div>
            <ButtonLink href={href} className="w-full sm:w-auto">
              {t(`${key}.cta`)}
            </ButtonLink>
          </li>
        ))}
      </ol>
    </Card>
  );
}
