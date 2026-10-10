import 'server-only';
import type { ClientSession, Types } from 'mongoose';
import { Membership } from './membership.model';
import type { Role } from './schemas';

export {
  acceptInvitationInTransaction,
  acceptMemberInvitation,
  inviteMember,
  listMemberInvitations,
  previewMemberInvitation,
  resendMemberInvitation,
  revokeMemberInvitation,
} from './invitation.service';
export { listMembers, removeMember, updateMember } from './member.service';
export type { MembersCtx } from './member.service';
export type { Role } from './schemas';

/**
 * Inserts a membership inside the caller's transaction. A user who already belongs to a wedding
 * makes this fail with a duplicate-key error on `userId` (DATABASE_DESIGN §5.5).
 */
export async function addMember(
  session: ClientSession,
  member: { weddingId: Types.ObjectId; userId: Types.ObjectId; role: Role; label?: string },
): Promise<void> {
  await Membership.create([{ ...member, joinedAt: new Date() }], { session });
}
