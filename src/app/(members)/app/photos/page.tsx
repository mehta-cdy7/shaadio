import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { currentMember } from '@/app/_lib/current-member';
import { cn } from '@/lib/cn';
import { listEvents } from '@/modules/events';
import { listPhotos } from '@/modules/gallery';
import { FEATURED_LIMIT, NO_EVENT, type PhotoListQuery } from '@/modules/gallery/schemas';
import { getGallerySettings, getWebsite } from '@/modules/weddings';
import { storageConfigured } from '@/server/storage/storage';
import { PhotoGallery } from './_components/photo-gallery';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('members.photos');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

const FEATURED = 'featured';

/**
 * Photos (PRD §9.20–9.21): albums by event plus "Other", upload, view, feature for the website,
 * download and delete. Any member. Same services as `GET /api/photos` (API-08).
 */
export default async function PhotosPage({ searchParams }: PageProps<'/app/photos'>) {
  const current = await currentMember();
  if (!current?.member) redirect('/onboarding');
  const scope = { weddingId: current.member.weddingId };
  const t = await getTranslations('members.photos');

  const events = await listEvents(scope);
  const requested = (await searchParams).album;
  const album =
    typeof requested === 'string' &&
    (requested === NO_EVENT ||
      requested === FEATURED ||
      events.some((event) => event.id === requested))
      ? requested
      : undefined;
  const query: PhotoListQuery =
    album === FEATURED ? { featured: 'true' } : album ? { eventId: album } : {};

  const uploadsAvailable = storageConfigured();
  const [settings, website, page] = await Promise.all([
    getGallerySettings(scope),
    getWebsite(scope),
    uploadsAvailable ? listPhotos(scope, query) : Promise.resolve({ items: [] }),
  ]);
  const eventNames = events.map((event) => ({ id: event.id, name: event.name }));

  const tabs = [
    { key: undefined, label: t('albums.all') },
    ...eventNames.map((event) => ({ key: event.id, label: event.name })),
    { key: NO_EVENT, label: t('albums.other') },
    { key: FEATURED, label: t('albums.featured') },
  ];

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <header>
        <h1 className="font-display text-headline-lg-sm text-ink md:text-headline-lg">
          {t('title')}
        </h1>
        <p className="mt-1 max-w-prose text-body-lg text-ink-muted">{t('lead')}</p>
      </header>

      <nav
        aria-label={t('albums.label')}
        className="-mx-4 scrollbar-none overflow-x-auto px-4 md:mx-0 md:px-0"
      >
        <ul className="flex w-max gap-2">
          {tabs.map((tab) => {
            const selected = tab.key === album;
            return (
              <li key={tab.key ?? 'all'}>
                <Link
                  href={tab.key ? `/app/photos?album=${tab.key}` : '/app/photos'}
                  aria-current={selected ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-9 items-center rounded-full border px-4 text-body font-medium whitespace-nowrap transition-colors',
                    selected
                      ? 'border-primary bg-primary text-on-primary'
                      : 'border-line bg-surface text-ink hover:border-primary',
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <PhotoGallery
        key={album ?? 'all'}
        page={page}
        query={new URLSearchParams(query as Record<string, string>).toString()}
        album={album === FEATURED ? undefined : album}
        featuredView={album === FEATURED}
        events={eventNames}
        photosUsed={settings.photosUsed}
        photoLimit={settings.photoLimit}
        featuredCount={website.featuredPhotoCount}
        featuredLimit={FEATURED_LIMIT}
        uploadsAvailable={uploadsAvailable}
      />
    </div>
  );
}
