import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { currentMember } from '@/app/_lib/current-member';
import { coupleNames } from '@/lib/couple';
import { countEvents } from '@/modules/events';
import { EVENTS_PER_WEDDING } from '@/modules/events/schemas';
import { EventForm } from '../_components/event-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('members.events.form');
  return { title: t('metaAdd'), robots: { index: false, follow: false } };
}

/** Add event (PRD §9.5). */
export default async function NewEventPage() {
  const current = await currentMember();
  if (!current?.member) redirect('/onboarding');
  const { member } = current;
  const [first, second] = coupleNames(member.wedding);
  // Checked again on save; this only spares filling in a form that cannot be saved.
  const atLimit = (await countEvents({ weddingId: member.weddingId })) >= EVENTS_PER_WEDDING;
  return (
    <EventForm
      couple={`${first} & ${second}`}
      weddingDate={member.wedding.weddingDate}
      atLimit={atLimit}
    />
  );
}
