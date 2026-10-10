import 'server-only';
import type { MemberInvitationDoc } from './member-invitation.model';
import type { MembershipDoc } from './membership.model';
import type { Member, MemberInvitation } from './schemas';

/** Membership + user → API `Member` (API_DESIGN §12). */
export function toMember(
  membership: Pick<MembershipDoc, 'userId' | 'role' | 'label' | 'joinedAt'>,
  user: { name: string; email: string },
): Member {
  return {
    userId: membership.userId.toHexString(),
    name: user.name,
    email: user.email,
    role: membership.role,
    ...(membership.label ? { label: membership.label } : {}),
    joinedAt: membership.joinedAt.toISOString(),
  };
}

/** Document → API `MemberInvitation`. The token hash never leaves the server. */
export function toMemberInvitation(
  doc: Pick<
    MemberInvitationDoc,
    '_id' | 'email' | 'role' | 'label' | 'status' | 'invitedByUserId' | 'expiresAt' | 'createdAt'
  >,
  invitedByName: string,
  now = new Date(),
): MemberInvitation {
  const expired = doc.status === 'PENDING' && doc.expiresAt.getTime() <= now.getTime();
  return {
    id: doc._id.toHexString(),
    email: doc.email,
    role: doc.role,
    ...(doc.label ? { label: doc.label } : {}),
    status: expired ? 'EXPIRED' : doc.status,
    invitedBy: { userId: doc.invitedByUserId.toHexString(), name: invitedByName },
    expiresAt: doc.expiresAt.toISOString(),
    createdAt: doc.createdAt.toISOString(),
  };
}
