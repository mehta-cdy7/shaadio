import 'server-only';
import { createHash } from 'node:crypto';
import { Types, type ClientSession } from 'mongoose';
import { recordActivity } from '@/modules/activity';
import { assertEventsExist } from '@/modules/events';
import { changeFeaturedCount, releasePhotoSlots } from '@/modules/weddings';
import { connectDb } from '@/server/db/connection';
import { toObjectId } from '@/server/db/ids';
import { withTransaction } from '@/server/db/transaction';
import { AppError } from '@/server/http/errors';
import { deleteObjects } from '@/server/storage/storage';
import { toPhotoResponse } from './mapper';
import { Photo } from './photo.model';
import { PhotoUpload } from './photo-upload.model';
import {
  NO_EVENT,
  PHOTO_PAGE_SIZE_DEFAULT,
  type Photo as PhotoResponse,
  type PhotoListQuery,
  type PhotoListResponse,
  type UpdatePhotoInput,
} from './schemas';

type Scope = { weddingId: Types.ObjectId };

export type PhotoCtx = Scope & { userId: Types.ObjectId; user: { name: string } };

function notFound(): AppError {
  return new AppError('NOT_FOUND', 'Photo not found.');
}

/** A malformed id is the same 404 as another wedding's (API_DESIGN §3.3). */
function photoId(id: string): Types.ObjectId {
  const objectId = toObjectId(id);
  if (!objectId) throw notFound();
  return objectId;
}

// --- List ----------------------------------------------------------------------------------------

type Cursor = { c: string; i: string; f: string };

/** The filters a cursor was issued for (API_DESIGN §5.2): a cursor only continues the same list. */
function filterKey(query: PhotoListQuery): string {
  const canonical = JSON.stringify([
    query.eventId?.toLowerCase() ?? '',
    query.featured ?? '',
    query.uploaderType ?? '',
  ]);
  return createHash('sha256').update(canonical).digest('base64url').slice(0, 12);
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(value: string, key: string): { createdAt: Date; id: Types.ObjectId } {
  const invalid = () =>
    new AppError('VALIDATION_ERROR', 'This list has changed. Start again from the top.', {
      fields: { cursor: 'Invalid cursor.' },
    });
  let cursor: Partial<Cursor>;
  try {
    cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<Cursor>;
  } catch {
    throw invalid();
  }
  const id = typeof cursor.i === 'string' ? toObjectId(cursor.i) : undefined;
  const createdAt = typeof cursor.c === 'string' ? new Date(cursor.c) : undefined;
  if (!id || !createdAt || Number.isNaN(createdAt.getTime()) || cursor.f !== key) throw invalid();
  return { createdAt, id };
}

/**
 * `GET /api/photos` (API_DESIGN §21, DATABASE_DESIGN §13.5): newest first, `_id` as the tiebreak,
 * so photos sharing a timestamp are never skipped or repeated.
 */
export async function listPhotos(scope: Scope, query: PhotoListQuery): Promise<PhotoListResponse> {
  const key = filterKey(query);
  const after = query.cursor ? decodeCursor(query.cursor, key) : undefined;
  const limit = query.limit ?? PHOTO_PAGE_SIZE_DEFAULT;

  const filter: Record<string, unknown> = { weddingId: scope.weddingId };
  if (query.eventId === NO_EVENT) filter.eventId = { $exists: false };
  else if (query.eventId) filter.eventId = new Types.ObjectId(query.eventId);
  if (query.featured) filter.featured = true;
  if (query.uploaderType) filter.uploaderType = query.uploaderType;
  if (after) {
    filter.$or = [
      { createdAt: { $lt: after.createdAt } },
      { createdAt: after.createdAt, _id: { $lt: after.id } },
    ];
  }

  await connectDb();
  const docs = await Photo.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();
  const page = docs.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toPhotoResponse),
    ...(docs.length > limit && last
      ? {
          nextCursor: encodeCursor({
            c: last.createdAt.toISOString(),
            i: last._id.toHexString(),
            f: key,
          }),
        }
      : {}),
  };
}

/** Whether the wedding has any photo (for the wedding's `isEmpty`, API_DESIGN §11). */
export async function hasPhotos(scope: Scope): Promise<boolean> {
  await connectDb();
  return Boolean(await Photo.exists({ weddingId: scope.weddingId }));
}

/** Photos in an event's album, for the event delete preview (DATABASE_DESIGN §14.1). */
export async function countEventPhotos(scope: Scope, eventId: Types.ObjectId): Promise<number> {
  await connectDb();
  return Photo.countDocuments({ weddingId: scope.weddingId, eventId });
}

/**
 * Event deletion cascade (DATABASE_DESIGN §7, §14.1), inside the caller's transaction: the photos
 * move to "Other / Wedding Memories", and pending uploads lose the event too.
 */
export async function removeEventFromPhotos(
  session: ClientSession,
  scope: Scope,
  eventId: Types.ObjectId,
): Promise<void> {
  const filter = { weddingId: scope.weddingId, eventId };
  await Photo.updateMany(filter, { $unset: { eventId: '' } }, { session });
  await PhotoUpload.updateMany(filter, { $unset: { eventId: '' } }, { session });
}

// --- Edit ----------------------------------------------------------------------------------------

/**
 * `PATCH /api/photos/:id` (API_DESIGN §21): feature or unfeature (12 at most, DATABASE_DESIGN §9.4)
 * and move between albums. The current state is in the update filter, so a repeat changes nothing
 * and the counter moves only with a real change. Not logged (§5.15 has no action for it).
 */
export async function updatePhoto(
  scope: Scope,
  id: string,
  input: UpdatePhotoInput,
): Promise<PhotoResponse> {
  const _id = photoId(id);
  const [eventId] =
    typeof input.eventId === 'string'
      ? await assertEventsExist(scope, [input.eventId], 'eventId')
      : [];
  await connectDb();

  const doc = await withTransaction(async (session) => {
    const filter = { _id, weddingId: scope.weddingId };
    if (input.featured !== undefined) {
      const changed = await Photo.updateOne(
        { ...filter, featured: !input.featured },
        input.featured
          ? { $set: { featured: true, featuredAt: new Date() } }
          : { $set: { featured: false }, $unset: { featuredAt: '' } },
        { session },
      );
      if (
        changed.modifiedCount === 1 &&
        !(await changeFeaturedCount(session, scope.weddingId, input.featured ? 1 : -1))
      ) {
        throw new AppError('FEATURED_LIMIT', 'At most 12 photos can be featured.', { limit: 12 });
      }
    }
    if (input.eventId !== undefined) {
      await Photo.updateOne(filter, eventId ? { $set: { eventId } } : { $unset: { eventId: '' } }, {
        session,
      });
    }
    return Photo.findOne(filter, null, { session }).lean();
  });
  if (!doc) throw notFound();
  return toPhotoResponse(doc);
}

/**
 * `DELETE /api/photos/:id` (DATABASE_DESIGN §14.5): the row, its slot, its featured count and the
 * `photo.deleted` entry in one transaction; the R2 objects after commit. If that cleanup fails the
 * objects are orphaned under the wedding's prefix, costing storage but no slot.
 */
export async function deletePhoto(ctx: PhotoCtx, id: string): Promise<void> {
  const _id = photoId(id);
  await connectDb();
  const photo = await withTransaction(async (session) => {
    const deleted = await Photo.findOneAndDelete(
      { _id, weddingId: ctx.weddingId },
      { session },
    ).lean();
    if (!deleted) throw notFound();
    await releasePhotoSlots(ctx.weddingId, 1, session);
    if (deleted.featured) await changeFeaturedCount(session, ctx.weddingId, -1);
    await recordActivity(session, {
      weddingId: ctx.weddingId,
      actor: { userId: ctx.userId, name: ctx.user.name },
      action: 'photo.deleted',
      target: {
        type: 'photo',
        id: _id,
        label: deleted.uploaderName ? `Photo by ${deleted.uploaderName}` : 'Photo',
      },
      meta: { uploaderType: deleted.uploaderType, featured: deleted.featured },
    });
    return deleted;
  });
  try {
    await deleteObjects([photo.displayKey, photo.thumbKey]);
  } catch {
    console.error('[gallery] photo object cleanup failed');
  }
}
