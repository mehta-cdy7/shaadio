import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { currentMember } from '@/app/_lib/current-member';
import { coupleNames } from '@/lib/couple';
import { listMemberInvitations, listMembers } from '@/modules/members';
import { MembersPanel } from '../_components/members-panel';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('members.settings.members');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/**
 * Settings → Members (PRD §9.4). Admin only: a Manager gets the same 404 as an unknown settings
 * path. Same services as `GET /api/members` and `GET /api/member-invitations` (API-08).
 */
export default async function MembersPage() {
  const current = await currentMember();
  if (!current?.member) redirect('/onboarding');
  if (current.member.role !== 'ADMIN') notFound();
  const ctx = { weddingId: current.member.weddingId };
  const [members, invitations] = await Promise.all([listMembers(ctx), listMemberInvitations(ctx)]);

  return (
    <MembersPanel
      members={members.items}
      invitations={invitations.items}
      meId={current.session.user.id}
      meName={current.session.user.name}
      couple={coupleNames(current.member.wedding)}
    />
  );
}
