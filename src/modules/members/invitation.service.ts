import 'server-only';
import type { ClientSession, Types } from 'mongoose';
import type { z } from 'zod';
import { recordActivity } from '@/modules/activity';
import { findUserIdByEmail, findUsers } from '@/modules/auth';
import { changeAdminCount, findInvitationWedding, isWeddingEmpty } from '@/modules/weddings';
import { sendEmail } from '@/server/email/email';
import { env } from '@/server/env';
import { hashToken, newToken } from '@/server/auth/tokens';
import { connectDb } from '@/server/db/connection';
import { toObjectId } from '@/server/db/ids';
import { withTransaction } from '@/server/db/transaction';
import { findMemberInvitationByTokenHash, findMembershipByUserId } from '@/server/db/unscoped';
import { AppError } from '@/server/http/errors';
import { consume } from '@/server/rate-limit/rate-limit';
import { memberInvitationEmail } from './invitation-email';
import { toMemberInvitation } from './mapper';
import { countMembers, isMember, type MembersCtx } from './member.service';
import { MemberInvitation, type MemberInvitationDoc } from './member-invitation.model';
import { Membership } from './membership.model';
import {
  INVITATION_DAYS,
  MEMBERS_PER_WEDDING,
  type inviteMemberSchema,
  type MemberInvitationList,
  type MemberInvitationPreview,
  type SentMemberInvitation,
} from './schemas';

type InviteMember = z.output<typeof inviteMemberSchema>;

const DAY_SECONDS = 24 * 60 * 60;
const INVITATION_MS = INVITATION_DAYS * DAY_SECONDS * 1000;
/** `newToken()` is 32 random bytes in base64url. Anything else is not looked up. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function notFound(): AppError {
  return new AppError('NOT_FOUND', 'Invitation not found.');
}

function invitationId(id: string): Types.ObjectId {
  const objectId = toObjectId(id);
  if (!objectId) throw notFound();
  return objectId;
}

/** API_DESIGN §7: member invitations and resends, 20 a day per wedding. */
function consumeInviteAllowance(weddingId: Types.ObjectId) {
  return consume({
    scope: 'member-invite',
    key: weddingId.toHexString(),
    limit: 20,
    windowSeconds: DAY_SECONDS,
  });
}

function joinUrl(token: string): string {
  return `${env().APP_ORIGIN}/join/${token}`;
}

/**
 * Sends the invitation email outside any transaction (DATABASE_DESIGN §8). Best-effort: the link
 * is also returned to the Admin to share on WhatsApp or copy, so a failed send is not an error.
 */
async function sendInvitation(
  ctx: MembersCtx,
  doc: Pick<MemberInvitationDoc, 'email' | 'role'>,
  url: string,
): Promise<boolean> {
  const wedding = await findInvitationWedding(ctx.weddingId);
  if (!wedding) return false;
  return sendEmail(
    memberInvitationEmail({
      to: doc.email,
      inviterName: ctx.user.name,
      role: doc.role,
      joinUrl: url,
      wedding,
    }),
    'member-invitation',
  );
}

async function sent(
  ctx: MembersCtx,
  doc: MemberInvitationDoc,
  token: string,
): Promise<SentMemberInvitation> {
  const url = joinUrl(token);
  const emailSent = await sendInvitation(ctx, doc, url);
  return { ...toMemberInvitation(doc, ctx.user.name), joinUrl: url, emailSent };
}

/** `GET /api/member-invitations` (API_DESIGN §12): pending and expired, newest first. */
export async function listMemberInvitations(ctx: {
  weddingId: Types.ObjectId;
}): Promise<MemberInvitationList> {
  await connectDb();
  const docs = await MemberInvitation.find({ weddingId: ctx.weddingId, status: 'PENDING' })
    .sort({ createdAt: -1, _id: -1 })
    .lean();
  const users = await findUsers([...new Set(docs.map((doc) => doc.invitedByUserId))]);
  const now = new Date();
  return {
    items: docs.map((doc) =>
      toMemberInvitation(doc, users.get(doc.invitedByUserId.toHexString())?.name ?? '', now),
    ),
  };
}

/**
 * `POST /api/member-invitations` (API_DESIGN §12), Admin only. One pending invitation per email
 * (partial unique index); an expired one for the same email is renewed in place. If the email
 * belongs to someone in another wedding the invitation is still created, so this does not reveal
 * it; accepting fails for them with a clear message.
 */
export async function inviteMember(
  ctx: MembersCtx,
  input: InviteMember,
): Promise<SentMemberInvitation> {
  await consumeInviteAllowance(ctx.weddingId);
  await connectDb();

  const existingUser = await findUserIdByEmail(input.email);
  if (existingUser && (await isMember(ctx, existingUser))) {
    throw new AppError('ALREADY_MEMBER', 'This person is already a member of this wedding.');
  }

  const now = new Date();
  const pending = await MemberInvitation.findOne({
    weddingId: ctx.weddingId,
    email: input.email,
    status: 'PENDING',
  }).lean();
  if (pending && pending.expiresAt > now) {
    throw new AppError('INVITATION_PENDING', 'This email already has a pending invitation.');
  }

  const openInvitations = await MemberInvitation.countDocuments({
    weddingId: ctx.weddingId,
    status: 'PENDING',
    expiresAt: { $gt: now },
  });
  if ((await countMembers(ctx)) + openInvitations >= MEMBERS_PER_WEDDING) {
    throw new AppError('LIMIT_REACHED', 'This wedding already has the most members allowed.', {
      limit: MEMBERS_PER_WEDDING,
    });
  }

  const token = newToken();
  const fields = {
    role: input.role,
    tokenHash: hashToken(token),
    invitedByUserId: ctx.userId,
    expiresAt: new Date(now.getTime() + INVITATION_MS),
  };

  let doc: MemberInvitationDoc;
  try {
    doc = await withTransaction(async (session) => {
      let saved: MemberInvitationDoc | null;
      if (pending) {
        // Expired: renew it in place, so the pending-email index still allows only one.
        saved = await MemberInvitation.findOneAndUpdate(
          {
            _id: pending._id,
            weddingId: ctx.weddingId,
            status: 'PENDING',
            expiresAt: { $lte: now },
          },
          input.label
            ? { $set: { ...fields, label: input.label } }
            : { $set: fields, $unset: { label: '' } },
          { session, returnDocument: 'after' },
        ).lean();
        if (!saved) {
          throw new AppError('INVITATION_PENDING', 'This email already has a pending invitation.');
        }
      } else {
        const [created] = await MemberInvitation.create(
          [
            {
              weddingId: ctx.weddingId,
              email: input.email,
              ...(input.label ? { label: input.label } : {}),
              status: 'PENDING',
              ...fields,
            },
          ],
          { session },
        );
        saved = created!.toObject();
      }
      await recordActivity(session, {
        weddingId: ctx.weddingId,
        actor: { userId: ctx.userId, name: ctx.user.name },
        action: 'member.invited',
        target: { type: 'member_invitation', id: saved._id, label: input.email },
        meta: { role: input.role },
      });
      return saved;
    });
  } catch (error) {
    // Two Admins inviting the same email at once: the partial unique index decides.
    if ((error as { code?: number }).code === 11000) {
      throw new AppError('INVITATION_PENDING', 'This email already has a pending invitation.');
    }
    throw error;
  }

  return sent(ctx, doc, token);
}

/**
 * `POST /api/member-invitations/:id/resend` (API_DESIGN §12): a new token and a fresh 7-day
 * expiry on the same document, so the old link stops working. Works for expired invitations too.
 */
export async function resendMemberInvitation(
  ctx: MembersCtx,
  id: string,
): Promise<SentMemberInvitation> {
  const _id = invitationId(id);
  await consumeInviteAllowance(ctx.weddingId);
  await connectDb();
  const token = newToken();
  const doc = await MemberInvitation.findOneAndUpdate(
    { _id, weddingId: ctx.weddingId, status: 'PENDING' },
    {
      $set: {
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITATION_MS),
        invitedByUserId: ctx.userId,
      },
    },
    { returnDocument: 'after' },
  ).lean();
  if (!doc) throw notFound();
  return sent(ctx, doc, token);
}

/** `POST /api/member-invitations/:id/revoke` (API_DESIGN §12): the link stops working at once. */
export async function revokeMemberInvitation(
  ctx: MembersCtx,
  id: string,
): Promise<ReturnType<typeof toMemberInvitation>> {
  const _id = invitationId(id);
  await connectDb();
  const doc = await MemberInvitation.findOneAndUpdate(
    { _id, weddingId: ctx.weddingId, status: 'PENDING' },
    { $set: { status: 'REVOKED' } },
    { returnDocument: 'after' },
  ).lean();
  if (!doc) throw notFound();
  const name = (await findUsers([doc.invitedByUserId])).get(
    doc.invitedByUserId.toHexString(),
  )?.name;
  return toMemberInvitation(doc, name ?? '');
}

// --- The invited person's side ------------------------------------------------------------------

/**
 * The pending invitation behind a token, scoped by its own wedding (DATABASE_DESIGN §6.3 #2), or
 * undefined for a malformed, unknown, accepted or revoked token. Expired invitations are returned:
 * the join page tells the person to ask for a new one.
 */
async function findByToken(token: string, session?: ClientSession) {
  if (!TOKEN_PATTERN.test(token)) return undefined;
  const ref = await findMemberInvitationByTokenHash(hashToken(token));
  if (!ref) return undefined;
  await connectDb();
  const doc = await MemberInvitation.findOne(
    { _id: ref.invitationId, weddingId: ref.weddingId, status: 'PENDING' },
    null,
    { session },
  ).lean();
  return doc ?? undefined;
}

/**
 * `GET /api/public/member-invitations/:token` (API_DESIGN §26): who invited whom, for the join
 * page. Revoked, accepted and unknown tokens, and deleted weddings, are all the same undefined (404).
 */
export async function previewMemberInvitation(
  token: string,
): Promise<MemberInvitationPreview | undefined> {
  const doc = await findByToken(token);
  if (!doc) return undefined;
  const wedding = await findInvitationWedding(doc.weddingId);
  if (!wedding) return undefined;
  const inviter = (await findUsers([doc.invitedByUserId])).get(doc.invitedByUserId.toHexString());
  return {
    wedding: {
      brideName: wedding.brideName,
      groomName: wedding.groomName,
      nameOrder: wedding.nameOrder,
    },
    invitedBy: inviter?.name ?? '',
    email: doc.email,
    role: doc.role,
    ...(doc.label ? { label: doc.label } : {}),
    status: doc.expiresAt.getTime() <= Date.now() ? 'EXPIRED' : 'PENDING',
  };
}

type Joiner = { userId: Types.ObjectId; name: string; email: string };

/**
 * Accepts inside the caller's transaction (DATABASE_DESIGN §5.6): conditionally PENDING →
 * ACCEPTED while unexpired, then insert the membership. The unique `userId` index rejects a second
 * wedding, so two concurrent acceptances cannot both succeed. Used by accept and by signup.
 */
export async function acceptInvitationInTransaction(
  session: ClientSession,
  token: string,
  user: Joiner,
): Promise<void> {
  const doc = await findByToken(token, session);
  if (!doc || !(await findInvitationWedding(doc.weddingId))) throw notFound();
  if (doc.email !== user.email) {
    throw new AppError(
      'INVITE_EMAIL_MISMATCH',
      'This invitation was sent to a different email address.',
    );
  }
  const now = new Date();
  const accepted = await MemberInvitation.updateOne(
    { _id: doc._id, weddingId: doc.weddingId, status: 'PENDING', expiresAt: { $gt: now } },
    { $set: { status: 'ACCEPTED', acceptedAt: now, acceptedByUserId: user.userId } },
    { session },
  );
  if (accepted.modifiedCount === 0) {
    throw new AppError('INVITATION_EXPIRED', 'This invitation has expired.');
  }

  await Membership.create(
    [
      {
        weddingId: doc.weddingId,
        userId: user.userId,
        role: doc.role,
        ...(doc.label ? { label: doc.label } : {}),
        joinedAt: now,
      },
    ],
    { session },
  );
  if (doc.role === 'ADMIN') await changeAdminCount(session, doc.weddingId, 1);
  await recordActivity(session, {
    weddingId: doc.weddingId,
    actor: { userId: user.userId, name: user.name },
    action: 'member.joined',
    target: { type: 'member', id: user.userId, label: user.name },
    meta: { role: doc.role },
  });
}

/**
 * `POST /api/member-invitations/accept` (API_DESIGN §12): a signed-in user without a wedding.
 * `ALREADY_MEMBER` carries `currentWeddingIsEmpty`, so the page can offer to delete an empty
 * wedding first (SYSTEM_DESIGN §19).
 */
export async function acceptMemberInvitation(user: Joiner, token: string): Promise<void> {
  const current = await findMembershipByUserId(user.userId);
  if (current) {
    throw new AppError('ALREADY_MEMBER', 'You already belong to a wedding.', {
      currentWeddingIsEmpty: await isWeddingEmpty(current.weddingId),
    });
  }
  try {
    await withTransaction((session) => acceptInvitationInTransaction(session, token, user));
  } catch (error) {
    // A concurrent acceptance or wedding creation for the same user.
    if ((error as { code?: number }).code === 11000) {
      throw new AppError('ALREADY_MEMBER', 'You already belong to a wedding.', {
        currentWeddingIsEmpty: false,
      });
    }
    throw error;
  }
}
