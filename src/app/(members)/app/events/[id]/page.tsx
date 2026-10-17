import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { currentMember } from '@/app/_lib/current-member';
import { CoverCard } from '@/components/photos/cover-card';
import { coupleNames } from '@/lib/couple';
import { getEvent } from '@/modules/events';
import { storageConfigured } from '@/server/storage/storage';
import { EventForm } from '../_components/event-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('members.events.form');
  return { title: t('metaEdit'), robots: { index: false, follow: false } };
}

/** Edit event (PRD §9.5). Another wedding's id, or a deleted one, is a 404 (API §3.3). */
export default async function EditEventPage({ params }: PageProps<'/app/events/[id]'>) {
  const current = await currentMember();
  if (!current?.member) redirect('/onboarding');
  const { id } = await params;
  const event = await getEvent({ weddingId: current.member.weddingId }, id).catch(
    (error: unknown) => {
      if ((error as { code?: string }).code === 'NOT_FOUND') notFound();
      throw error;
    },
  );
  const [first, second] = coupleNames(current.member.wedding);
  const t = await getTranslations('coverImage.event');
  return (
    <div className="flex flex-col gap-8">
      <EventForm
        event={event}
        couple={`${first} & ${second}`}
        weddingDate={current.member.wedding.weddingDate}
      />
      {storageConfigured() && (
        <div className="lg:max-w-xl">
          <CoverCard
            target="EVENT"
            eventId={event.id}
            {...(event.coverImageUrl ? { initialUrl: event.coverImageUrl } : {})}
            title={t('title')}
            hint={t('hint')}
          />
        </div>
      )}
    </div>
  );
}
