import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Eyebrow } from '@/components/ui/typography';
import { CEREMONIES } from '@/lib/ceremonies';

/** Sign-in side panel: the brand line inside a jharokha arch, with the ceremonies below. */
export async function CeremonyArch() {
  const t = await getTranslations('auth.aside');
  const tc = await getTranslations('landing.ceremonies');

  return (
    <div className="flex w-full max-w-105 flex-col items-center gap-8">
      <figure className="w-full rounded-t-full border border-secondary bg-canvas/50 px-10 pt-20 pb-12 text-center">
        <span aria-hidden="true" className="mx-auto mb-6 block size-2 rounded-full bg-secondary" />
        <blockquote className="font-display text-headline-md font-normal text-balance text-ink italic">
          {t('quote')}
        </blockquote>
        <Eyebrow className="mt-4">{t('eyebrow')}</Eyebrow>
      </figure>
      <ul aria-label={t('ceremoniesLabel')} className="flex flex-wrap justify-center gap-2">
        {CEREMONIES.map((key) => (
          <li key={key}>
            <Badge tone="plain" size="sm" className="border border-secondary/60 text-ink">
              {tc(key)}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
