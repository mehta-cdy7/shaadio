import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { currentMember } from '@/app/_lib/current-member';
import { coupleNames } from '@/lib/couple';
import { listEvents } from '@/modules/events';
import { getGuest } from '@/modules/guests';
import { toEventOption } from '../../_components/event-option';
import { GuestForm } from '../../_components/guest-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('members.guests.form');
  return { title: t('metaEdit'), robots: { index: false, follow: false } };
}

/** Edit guest (PRD §9.7). Another wedding's id, or a deleted one, is a 404 (API §3.3). */
export default async function EditGuestPage({ params }: PageProps<'/app/guests/[id]/edit'>) {
  const current = await currentMember();
  if (!current?.member) redirect('/onboarding');
  const scope = { weddingId: current.member.weddingId };
  const { id } = await params;
  const [guest, events] = await Promise.all([
    getGuest(scope, id).catch((error: unknown) => {
      if ((error as { code?: string }).code === 'NOT_FOUND') notFound();
      throw error;
    }),
    listEvents(scope),
  ]);
  // The form never needs the link; keep it out of the client payload.
  const fields = { ...guest, inviteUrl: undefined };
  const [first, second] = coupleNames(current.member.wedding);
  return (
    <GuestForm guest={fields} events={events.map(toEventOption)} couple={`${first} & ${second}`} />
  );
}
