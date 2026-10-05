import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { currentMember } from '@/app/_lib/current-member';
import { coupleNames } from '@/lib/couple';
import { listEvents } from '@/modules/events';
import { countGuests } from '@/modules/guests';
import { GUESTS_PER_WEDDING } from '@/modules/guests/schemas';
import { toEventOption } from '../_components/event-option';
import { GuestForm } from '../_components/guest-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('members.guests.form');
  return { title: t('metaAdd'), robots: { index: false, follow: false } };
}

/** Add guest (PRD §9.7–9.8). */
export default async function NewGuestPage() {
  const current = await currentMember();
  if (!current?.member) redirect('/onboarding');
  const { member } = current;
  const scope = { weddingId: member.weddingId };
  const [first, second] = coupleNames(member.wedding);
  const [events, count] = await Promise.all([listEvents(scope), countGuests(scope)]);
  return (
    <GuestForm
      events={events.map(toEventOption)}
      couple={`${first} & ${second}`}
      // Checked again on save; this only spares filling in a form that cannot be saved.
      atLimit={count >= GUESTS_PER_WEDDING}
    />
  );
}
