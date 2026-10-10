import 'server-only';
import type { Types } from 'mongoose';
import { withUser, type UserCtx } from '@/modules/auth';
import type { MeResponse } from '@/modules/auth/schemas';
import { AppError } from '@/server/http/errors';
import type { RequestMeta } from '@/server/http/route';
import { resolveMember } from './wedding.service';

export {
  changeAdminCount,
  createWedding,
  findInvitationWedding,
  getWedding,
  isWeddingEmpty,
  resolveMember,
  updateWedding,
} from './wedding.service';
export type { InvitationWedding, MemberContext } from './wedding.service';

export type MemberCtx = UserCtx & {
  weddingId: Types.ObjectId;
  role: 'ADMIN' | 'MANAGER';
  /** Read with the membership, for rules that depend on the wedding (e.g. event dates). */
  wedding: { weddingDate: string; timezone: string };
};

/**
 * Route wrapper for member endpoints (API_DESIGN §3.2): signed in, a membership, an ACTIVE wedding
 * and at least `role`. The wedding id comes only from the membership, never from the request.
 */
export function withMember(
  options: { role?: 'ADMIN' | 'MANAGER' },
  fn: (req: Request, ctx: MemberCtx) => Promise<Response>,
): (req: Request, meta: RequestMeta) => Promise<Response> {
  return withUser(async (req, ctx) => {
    const member = await resolveMember(ctx.userId);
    if (!member) throw new AppError('NO_WEDDING', 'You are not part of a wedding.');
    if (options.role === 'ADMIN' && member.role !== 'ADMIN') {
      throw new AppError('FORBIDDEN', 'Only an Admin can do this.');
    }
    const { weddingDate, timezone } = member.wedding;
    return fn(req, {
      ...ctx,
      weddingId: member.weddingId,
      role: member.role,
      wedding: { weddingDate, timezone },
    });
  });
}

/** The membership and wedding parts of `MeResponse` (API_DESIGN §10), empty without a wedding. */
export async function meWeddingFields(
  userId: Types.ObjectId,
): Promise<Pick<MeResponse, 'membership' | 'wedding'>> {
  const member = await resolveMember(userId);
  if (!member) return {};
  const { wedding } = member;
  return {
    membership: { role: member.role, ...(member.label ? { label: member.label } : {}) },
    wedding: {
      id: wedding._id.toHexString(),
      brideName: wedding.brideName,
      groomName: wedding.groomName,
      nameOrder: wedding.nameOrder,
      weddingDate: wedding.weddingDate,
    },
  };
}
