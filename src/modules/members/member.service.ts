import 'server-only';
import type { Types } from 'mongoose';
import type { z } from 'zod';
import { recordActivity } from '@/modules/activity';
import { findUsers } from '@/modules/auth';
import { changeAdminCount } from '@/modules/weddings';
import { connectDb } from '@/server/db/connection';
import { toObjectId } from '@/server/db/ids';
import { withTransaction } from '@/server/db/transaction';
import { AppError } from '@/server/http/errors';
import { toMember } from './mapper';
import { Membership } from './membership.model';
import type { Member, MemberList, updateMemberSchema } from './schemas';

/** The caller, from `withMember` (API_DESIGN §3.2). The wedding id never comes from the request. */
export type MembersCtx = {
  weddingId: Types.ObjectId;
  userId: Types.ObjectId;
  user: { name: string };
};

type UpdateMember = z.output<typeof updateMemberSchema>;

function notFound(): AppError {
  return new AppError('NOT_FOUND', 'Member not found.');
}

function lastAdmin(): AppError {
  return new AppError('LAST_ADMIN', 'A wedding needs at least one Admin.');
}

/** The path id as an ObjectId; a malformed id is the same 404 as another wedding's (API §3.3). */
function memberUserId(id: string): Types.ObjectId {
  const objectId = toObjectId(id);
  if (!objectId) throw notFound();
  return objectId;
}

function actor(ctx: MembersCtx) {
  return { userId: ctx.userId, name: ctx.user.name };
}

/** `GET /api/members` (API_DESIGN §12): everyone in the wedding, earliest joined first. */
export async function listMembers(ctx: { weddingId: Types.ObjectId }): Promise<MemberList> {
  await connectDb();
  const memberships = await Membership.find({ weddingId: ctx.weddingId })
    .sort({ joinedAt: 1, _id: 1 })
    .lean();
  const users = await findUsers(memberships.map((membership) => membership.userId));
  return {
    items: memberships.flatMap((membership) => {
      const user = users.get(membership.userId.toHexString());
      return user ? [toMember(membership, user)] : [];
    }),
  };
}

/** Members plus pending invitations count towards the 25 (PRD §9.4). */
export async function countMembers(ctx: { weddingId: Types.ObjectId }): Promise<number> {
  await connectDb();
  return Membership.countDocuments({ weddingId: ctx.weddingId });
}

/** Whether this user is already a member of this wedding. */
export async function isMember(
  ctx: { weddingId: Types.ObjectId },
  userId: Types.ObjectId,
): Promise<boolean> {
  await connectDb();
  return (await Membership.exists({ weddingId: ctx.weddingId, userId })) !== null;
}

/**
 * `PATCH /api/members/:userId` (API_DESIGN §12), Admin only. A role change moves
 * `counters.adminCount` in the same transaction, so the last Admin can never be demoted, even by
 * two Admins demoting each other at once (DATABASE_DESIGN §9.2).
 */
export async function updateMember(
  ctx: MembersCtx,
  id: string,
  input: UpdateMember,
): Promise<Member> {
  const userId = memberUserId(id);
  await connectDb();

  await withTransaction(async (session) => {
    const current = await Membership.findOne({ weddingId: ctx.weddingId, userId }, null, {
      session,
    }).lean();
    if (!current) throw notFound();

    const set: Record<string, unknown> = {};
    const unset: Record<string, ''> = {};
    const roleChanged = input.role !== undefined && input.role !== current.role;
    if (roleChanged) set.role = input.role;
    if (input.label === null) unset.label = '';
    else if (input.label !== undefined) set.label = input.label;
    if (!Object.keys(set).length && !Object.keys(unset).length) return;

    // The role in the filter makes a concurrent change of the same member a no-op here.
    const updated = await Membership.updateOne(
      { weddingId: ctx.weddingId, userId, role: current.role },
      {
        ...(Object.keys(set).length ? { $set: set } : {}),
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
      },
      { session },
    );
    if (updated.matchedCount === 0) throw notFound();

    if (roleChanged) {
      const moved = await changeAdminCount(session, ctx.weddingId, input.role === 'ADMIN' ? 1 : -1);
      if (!moved) throw lastAdmin();
      const name = (await findUsers([userId])).get(userId.toHexString())?.name ?? '';
      await recordActivity(session, {
        weddingId: ctx.weddingId,
        actor: actor(ctx),
        action: 'member.role_changed',
        target: { type: 'member', id: userId, label: name },
        changes: [{ field: 'role', before: current.role, after: input.role }],
      });
    }
  });

  const membership = await Membership.findOne({ weddingId: ctx.weddingId, userId }).lean();
  const user = (await findUsers([userId])).get(userId.toHexString());
  if (!membership || !user) throw notFound();
  return toMember(membership, user);
}

/**
 * `DELETE /api/members/:userId` (API_DESIGN §12), Admin only. Removing an Admin decrements
 * `counters.adminCount` in the same transaction: an Admin may remove themselves only while another
 * Admin exists. Their tasks become unassigned once tasks exist (M3).
 */
export async function removeMember(ctx: MembersCtx, id: string): Promise<void> {
  const userId = memberUserId(id);
  await connectDb();
  const name = (await findUsers([userId])).get(userId.toHexString())?.name ?? '';

  await withTransaction(async (session) => {
    const removed = await Membership.findOneAndDelete(
      { weddingId: ctx.weddingId, userId },
      { session, projection: { role: 1 } },
    ).lean();
    if (!removed) throw notFound();
    if (removed.role === 'ADMIN' && !(await changeAdminCount(session, ctx.weddingId, -1))) {
      throw lastAdmin();
    }
    await recordActivity(session, {
      weddingId: ctx.weddingId,
      actor: actor(ctx),
      action: 'member.removed',
      target: { type: 'member', id: userId, label: name },
      meta: { role: removed.role },
    });
  });
}
