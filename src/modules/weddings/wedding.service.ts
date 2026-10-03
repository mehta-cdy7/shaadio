import 'server-only';
import { randomBytes } from 'node:crypto';
import type { Types } from 'mongoose';
import { coupleNames } from '@/lib/couple';
import { addMember } from '@/modules/members';
import { connectDb } from '@/server/db/connection';
import { withTransaction } from '@/server/db/transaction';
import { findMembershipByUserId, type MembershipRef } from '@/server/db/unscoped';
import { AppError } from '@/server/http/errors';
import { toWeddingResponse } from './mapper';
import { DEFAULT_TIMEZONE, type CreateWeddingInput, type WeddingResponse } from './schemas';
import { newWebsiteSlug } from './slug';
import { Wedding, type WeddingDoc } from './wedding.model';

/** Slug suffix collisions (~31 bits) are rare; a few retries make one practically impossible. */
const SLUG_ATTEMPTS = 3;

/** The parsed create body (defaults applied, blanks dropped). */
type CreateWedding = Omit<CreateWeddingInput, 'nameOrder'> & {
  nameOrder: 'BRIDE_FIRST' | 'GROOM_FIRST';
};

export type MemberContext = MembershipRef & {
  wedding: Pick<
    WeddingDoc,
    '_id' | 'brideName' | 'groomName' | 'nameOrder' | 'weddingDate' | 'timezone' | 'location'
  >;
};

/**
 * Whether the wedding has no events, guests, tasks, expenses, vendors or photos (API_DESIGN §11).
 * None of those collections exist yet, so it is always true; each module adds its check here,
 * scoped by the wedding id, as it lands (slice 13 relies on this for one-step deletion).
 */
async function isWeddingEmpty(): Promise<boolean> {
  return true;
}

/**
 * Creates the wedding and makes the caller its first Admin, in one transaction (DATABASE_DESIGN
 * §8): a wedding with no Admin is unrecoverable. The unique `userId` index on memberships is what
 * stops a second wedding, even for two concurrent requests.
 */
export async function createWedding(
  userId: Types.ObjectId,
  input: CreateWedding,
): Promise<WeddingResponse> {
  if (await findMembershipByUserId(userId)) {
    throw new AppError('ALREADY_MEMBER', 'You already belong to a wedding.');
  }
  const [first, second] = coupleNames(input);

  for (let attempt = 1; ; attempt++) {
    try {
      const wedding = await withTransaction(async (session) => {
        const [created] = await Wedding.create(
          [
            {
              brideName: input.brideName,
              groomName: input.groomName,
              nameOrder: input.nameOrder,
              title: input.title,
              description: input.description,
              weddingDate: input.weddingDate,
              timezone: input.timezone ?? DEFAULT_TIMEZONE,
              location: input.location,
              website: { slug: newWebsiteSlug(first, second) },
              gallery: { token: randomBytes(16).toString('base64url') },
              createdByUserId: userId,
            },
          ],
          { session },
        );
        await addMember(session, { weddingId: created!._id, userId, role: 'ADMIN' });
        return created!;
      });
      return toWeddingResponse(wedding.toObject(), await isWeddingEmpty());
    } catch (error) {
      const duplicate = error as { code?: number; keyPattern?: Record<string, unknown> };
      if (duplicate.code !== 11000) throw error;
      if (duplicate.keyPattern?.userId) {
        throw new AppError('ALREADY_MEMBER', 'You already belong to a wedding.');
      }
      // A slug or gallery-token collision: try again with fresh values.
      if (attempt >= SLUG_ATTEMPTS) throw error;
    }
  }
}

/**
 * The caller's membership and ACTIVE wedding, or undefined (API_DESIGN §3.2). A DELETING wedding
 * counts as none.
 */
export async function resolveMember(userId: Types.ObjectId): Promise<MemberContext | undefined> {
  const membership = await findMembershipByUserId(userId);
  if (!membership) return undefined;
  await connectDb();
  const wedding = await Wedding.findOne(
    { _id: membership.weddingId, status: 'ACTIVE' },
    { brideName: 1, groomName: 1, nameOrder: 1, weddingDate: 1, timezone: 1, location: 1 },
  ).lean();
  return wedding ? { ...membership, wedding } : undefined;
}

/** `GET /api/wedding`: the caller's own wedding, addressed only through ctx. */
export async function getWedding(ctx: { weddingId: Types.ObjectId }): Promise<WeddingResponse> {
  await connectDb();
  const wedding = await Wedding.findOne({ _id: ctx.weddingId, status: 'ACTIVE' }).lean();
  if (!wedding) throw new AppError('NO_WEDDING', 'You are not part of a wedding.');
  return toWeddingResponse(wedding, await isWeddingEmpty());
}
