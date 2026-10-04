import 'server-only';
import { randomBytes } from 'node:crypto';
import type { Types } from 'mongoose';
import type { z } from 'zod';
import { coupleNames } from '@/lib/couple';
import { todayIn } from '@/lib/dates';
import { addMember } from '@/modules/members';
import { connectDb } from '@/server/db/connection';
import { withTransaction } from '@/server/db/transaction';
import { findMembershipByUserId, type MembershipRef } from '@/server/db/unscoped';
import { AppError } from '@/server/http/errors';
import { toWeddingResponse } from './mapper';
import {
  DEFAULT_TIMEZONE,
  type CreateWeddingInput,
  type updateWeddingSchema,
  type WeddingResponse,
} from './schemas';
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

type UpdateWedding = z.output<typeof updateWeddingSchema>;

/**
 * Optional location fields tied to the place itself: set when given, otherwise removed, because
 * they described the old place. `country` is not one of them: it is kept unless sent.
 */
const PLACE_FIELDS = ['state', 'lat', 'lng', 'googlePlaceId'] as const;

/**
 * `PATCH /api/wedding` (API_DESIGN §11) for any member. One targeted update: given fields are
 * `$set`, cleared ones `$unset` (never stored as null). A sent `location` replaces the place
 * (state, coordinates, place id) but keeps the country unless one is sent. The website slug and
 * timezone never change.
 * A new date must be today or later in the wedding's own timezone; other fields stay editable
 * after the wedding day.
 */
export async function updateWedding(
  ctx: { weddingId: Types.ObjectId },
  input: UpdateWedding,
): Promise<WeddingResponse> {
  await connectDb();
  const filter = { _id: ctx.weddingId, status: 'ACTIVE' as const };

  if (input.weddingDate !== undefined) {
    const current = await Wedding.findOne(filter, { timezone: 1, weddingDate: 1 }).lean();
    if (!current) throw new AppError('NO_WEDDING', 'You are not part of a wedding.');
    if (
      input.weddingDate !== current.weddingDate &&
      input.weddingDate < todayIn(current.timezone)
    ) {
      throw new AppError('VALIDATION_ERROR', 'Some fields are invalid.', {
        fields: { weddingDate: 'Choose today or a later date.' },
      });
    }
  }

  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};
  for (const key of ['brideName', 'groomName', 'nameOrder', 'weddingDate'] as const) {
    if (input[key] !== undefined) set[key] = input[key];
  }
  for (const key of ['title', 'description', 'rsvpDeadline'] as const) {
    if (input[key] === null) unset[key] = '';
    else if (input[key] !== undefined) set[key] = input[key];
  }
  if (input.location) {
    set['location.formattedAddress'] = input.location.formattedAddress;
    set['location.city'] = input.location.city;
    for (const key of PLACE_FIELDS) {
      if (input.location[key] === undefined) unset[`location.${key}`] = '';
      else set[`location.${key}`] = input.location[key];
    }
    if (input.location.country !== undefined) set['location.country'] = input.location.country;
  }

  const update = {
    ...(Object.keys(set).length ? { $set: set } : {}),
    ...(Object.keys(unset).length ? { $unset: unset } : {}),
  };
  const wedding = Object.keys(update).length
    ? await Wedding.findOneAndUpdate(filter, update, {
        returnDocument: 'after',
        runValidators: true,
      }).lean()
    : await Wedding.findOne(filter).lean();
  if (!wedding) throw new AppError('NO_WEDDING', 'You are not part of a wedding.');
  return toWeddingResponse(wedding, await isWeddingEmpty());
}
