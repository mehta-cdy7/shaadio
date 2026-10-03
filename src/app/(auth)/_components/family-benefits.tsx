import type { ComponentType, SVGProps } from 'react';
import { getTranslations } from 'next-intl/server';
import { PhoneIcon, ShieldCheckIcon, UsersIcon } from '@/components/ui/icons';
import { Eyebrow, Heading } from '@/components/ui/typography';

const BENEFITS: Array<{
  key: 'family' | 'guests' | 'privacy';
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}> = [
  { key: 'family', Icon: UsersIcon },
  { key: 'guests', Icon: PhoneIcon },
  { key: 'privacy', Icon: ShieldCheckIcon },
];

/** Sign-up side panel: three reasons families choose Shaadioo, in one card. */
export async function FamilyBenefits() {
  const t = await getTranslations('auth.benefits');

  return (
    <div className="flex w-full max-w-105 flex-col gap-10">
      <div className="flex flex-col items-center gap-1 text-center">
        <Eyebrow>{t('eyebrow')}</Eyebrow>
        <Heading as="h2" size="headline-md" className="font-normal">
          {t('title')}
        </Heading>
      </div>
      <ul className="flex flex-col divide-y divide-secondary/60 rounded-card border border-line bg-surface px-7 shadow-card">
        {BENEFITS.map(({ key, Icon }) => (
          <li key={key} className="flex items-start gap-4 py-6">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft">
              <Icon width={16} height={16} />
            </span>
            <div className="flex flex-col gap-1">
              <h3 className="text-title font-medium text-ink">{t(`${key}.title`)}</h3>
              <p className="text-body-sm text-ink-muted">{t(`${key}.body`)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
