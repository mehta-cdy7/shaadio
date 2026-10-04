import type { ComponentType, SVGProps } from 'react';
import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/** Placeholder card for a workspace section whose slice has not landed yet. */
export async function ComingSoon({
  section,
  icon: Icon,
}: {
  section: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  const t = await getTranslations('members.comingSoon');
  return (
    <Card className="flex flex-col items-center gap-3 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft">
        <Icon width={24} height={24} />
      </span>
      <h2 className="font-display text-headline-sm text-ink">{t('title')}</h2>
      <p className="max-w-96 text-body text-pretty text-ink-muted">{t('body', { section })}</p>
      <ButtonLink href="/app" variant="outline" className="mt-2">
        {t('back')}
      </ButtonLink>
    </Card>
  );
}
