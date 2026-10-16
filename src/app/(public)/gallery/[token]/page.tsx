import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/cn';
import { coupleNames } from '@/lib/couple';
import { getPublicGallery, listPublicPhotos } from '@/modules/gallery';
import {
  NO_EVENT,
  type PublicGallery,
  type PublicPhotoListResponse,
} from '@/modules/gallery/schemas';
import { consume } from '@/server/rate-limit/rate-limit';
import { storageConfigured } from '@/server/storage/storage';
import { GuestPhotos } from './_components/guest-photos';
import { GuestUpload } from './_components/guest-upload';

/**
 * One load per request, shared by the metadata and the page. Every failure to open the link is the
 * generic not-found page (API_DESIGN §30).
 */
const loadGallery = cache(async (token: string): Promise<PublicGallery> => {
  try {
    const ip = (await headers()).get('x-real-ip') ?? 'unknown';
    await consume({ scope: 'gallery-get', key: ip, limit: 300, windowSeconds: 60 });
    return await getPublicGallery(token);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'NOT_FOUND' || code === 'RATE_LIMITED') notFound();
    throw error;
  }
});

export async function generateMetadata({
  params,
}: PageProps<'/gallery/[token]'>): Promise<Metadata> {
  const { token } = await params;
  const t = await getTranslations('gallery');
  const gallery = await loadGallery(token);
  return {
    title: { absolute: t('metaTitle', { couple: coupleNames(gallery.wedding).join(' & ') }) },
  };
}

/**
 * The guest gallery (PRD §9.20–9.22, Stitch "Guest gallery"), reached by the QR code. No account:
 * guests add photos with an optional name and ceremony, and see everyone's photos while the family
 * allows it. Server-rendered, with two small client islands for budget phones (SYSTEM §3.6).
 */
export default async function GalleryPage({ params, searchParams }: PageProps<'/gallery/[token]'>) {
  const { token } = await params;
  const gallery = await loadGallery(token);
  const t = await getTranslations('gallery');
  const [first, second] = coupleNames(gallery.wedding);

  const available = storageConfigured();
  const requested = (await searchParams).album;
  const album =
    typeof requested === 'string' &&
    (requested === NO_EVENT || gallery.albums.some((a) => a.eventId === requested))
      ? requested
      : undefined;
  const page: PublicPhotoListResponse =
    available && gallery.viewEnabled
      ? await listPublicPhotos(token, album ? { eventId: album } : {})
      : { items: [] };
  const uploadOpen = available && gallery.uploadEnabled;
  const closed = !gallery.viewEnabled && !uploadOpen;

  const tabs = [
    { key: undefined, label: t('albums.all') },
    ...gallery.albums.map((a) => ({ key: a.eventId, label: a.name })),
    { key: NO_EVENT, label: t('albums.other') },
  ];

  return (
    <main className="min-h-dvh bg-canvas px-4 py-8 text-ink md:py-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="rounded-t-arch rounded-b-card border border-line bg-surface px-6 pt-10 pb-8 text-center shadow-card md:pt-14">
          <p className="text-label-sm font-semibold tracking-widest text-secondary-ink uppercase">
            ✦ {t('eyebrow')} ✦
          </p>
          <h1 className="mt-3 font-display text-headline-lg-sm [overflow-wrap:anywhere] text-ink md:text-display-sm">
            {first} <span className="text-secondary-ink italic">&amp;</span> {second}
          </h1>
          <div aria-hidden className="mx-auto mt-4 h-px w-12 bg-secondary" />
          <p className="mx-auto mt-4 max-w-md text-body-lg text-ink-muted">
            {closed ? t('closed') : uploadOpen ? t('lead') : t('leadViewOnly')}
          </p>
        </header>

        {gallery.photosPurged && (
          <p className="rounded-card border border-line bg-surface p-6 text-center text-body text-ink-muted">
            {t('purged')}
          </p>
        )}

        {uploadOpen && (
          <GuestUpload
            token={token}
            albums={gallery.albums}
            defaultEventId={album === NO_EVENT ? undefined : album}
          />
        )}

        {available && gallery.viewEnabled && !gallery.photosPurged && (
          <section aria-labelledby="photos-title" className="flex flex-col gap-4">
            <h2 id="photos-title" className="font-display text-headline-sm text-ink">
              {t('photosTitle')}
            </h2>
            {gallery.albums.length > 0 && (
              <nav
                aria-label={t('albums.label')}
                className="-mx-4 scrollbar-none overflow-x-auto px-4"
              >
                <ul className="flex w-max gap-2">
                  {tabs.map((tab) => (
                    <li key={tab.key ?? 'all'}>
                      <Link
                        href={tab.key ? `/gallery/${token}?album=${tab.key}` : `/gallery/${token}`}
                        scroll={false}
                        aria-current={tab.key === album ? 'page' : undefined}
                        className={cn(
                          'inline-flex h-9 items-center rounded-full border px-4 text-body font-medium whitespace-nowrap',
                          tab.key === album
                            ? 'border-primary bg-primary text-on-primary'
                            : 'border-line bg-surface text-ink',
                        )}
                      >
                        {tab.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            <GuestPhotos key={album ?? 'all'} token={token} page={page} album={album} />
          </section>
        )}

        {!gallery.viewEnabled && uploadOpen && (
          <p className="rounded-card bg-canvas-muted p-4 text-center text-body text-ink-muted">
            {t('viewOff')}
          </p>
        )}

        <p className="text-center text-label text-ink-muted">{t('footer')}</p>
      </div>
    </main>
  );
}
