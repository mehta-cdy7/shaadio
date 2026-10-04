import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { currentMember } from '@/app/_lib/current-member';
import { getWedding } from '@/modules/weddings';
import { WeddingDetailsForm } from './_components/wedding-details-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('members.settings');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/** Settings → Wedding details (PRD §9.25): any member edits through `PATCH /api/wedding`. */
export default async function WeddingDetailsPage() {
  const current = await currentMember();
  if (!current?.member) redirect('/onboarding');
  // Same service as GET /api/wedding (API-08), scoped by the membership only.
  const wedding = await getWedding({ weddingId: current.member.weddingId });
  return <WeddingDetailsForm wedding={wedding} />;
}
