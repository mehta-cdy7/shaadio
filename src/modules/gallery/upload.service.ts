import 'server-only';
import { Types, type ClientSession } from 'mongoose';
import { assertEventsExist } from '@/modules/events';
import { countUploadOutcomes, releasePhotoSlots, reservePhotoSlots } from '@/modules/weddings';
import { connectDb } from '@/server/db/connection';
import { withTransaction } from '@/server/db/transaction';
import { AppError } from '@/server/http/errors';
import { newKeyId, photoKeys, stagingKeys } from '@/server/storage/keys';
import {
  copyObject,
  deleteObjects,
  headObject,
  readObjectStart,
  signUploadUrl,
  UPLOAD_URL_SECONDS,
} from '@/server/storage/storage';
import { sniffImageType } from './format';
import { toPhotoResponse } from './mapper';
import { Photo } from './photo.model';
import { PhotoUpload, type PhotoUploadDoc } from './photo-upload.model';
import type {
  CompleteUploadsResponse,
  DeclaredPhoto,
  UploadFailure,
  UploadResult,
  UploadTicketsResponse,
} from './schemas';

/**
 * The photo upload protocol (API_DESIGN §22, SYSTEM_DESIGN §39), shared by members and guests:
 * reserve slots → sign staging URLs → the browser PUTs → verify the bytes → copy to final keys →
 * publish. Only the uploader differs; authorization and rate limits stay with the caller.
 *
 * R2 is never called inside a transaction (DATABASE_DESIGN §8): verification and copies happen
 * first, and the publish transaction only records them.
 */

export type Uploader = {
  weddingId: Types.ObjectId;
  uploaderType: 'MEMBER' | 'GUEST';
  uploaderUserId?: Types.ObjectId;
  uploaderName?: string;
  deviceIdHash?: string;
};

/** How many photos are verified and copied at once in one `complete` call. */
const COMPLETE_CONCURRENCY = 5;

/** `POST …/upload-requests` (API_DESIGN §22.1), after the caller's access and rate-limit checks. */
export async function requestUploads(
  uploader: Uploader,
  input: { eventId?: string; photos: DeclaredPhoto[] },
): Promise<UploadTicketsResponse> {
  const scope = { weddingId: uploader.weddingId };
  const [eventId] = input.eventId ? await assertEventsExist(scope, [input.eventId], 'eventId') : [];

  const count = input.photos.length;
  const reservation = await reservePhotoSlots(uploader.weddingId, count);
  if (!reservation.reserved) {
    throw new AppError('GALLERY_FULL', 'The gallery is full.', {
      remaining: reservation.remaining,
    });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + UPLOAD_URL_SECONDS * 1000);
  const weddingKey = uploader.weddingId.toHexString();
  const docs = input.photos.map((declared) => {
    const keyId = newKeyId();
    const staging = stagingKeys(weddingKey, keyId);
    return {
      _id: new Types.ObjectId(),
      weddingId: uploader.weddingId,
      uploaderType: uploader.uploaderType,
      ...(uploader.uploaderUserId ? { uploaderUserId: uploader.uploaderUserId } : {}),
      ...(uploader.uploaderName ? { uploaderName: uploader.uploaderName } : {}),
      ...(uploader.deviceIdHash ? { deviceIdHash: uploader.deviceIdHash } : {}),
      ...(eventId ? { eventId } : {}),
      keyId,
      stagingDisplayKey: staging.display,
      stagingThumbKey: staging.thumb,
      declared,
      expiresAt,
    };
  });

  try {
    await connectDb();
    await PhotoUpload.insertMany(docs);
    const uploads = await Promise.all(
      docs.map(async (doc) => ({
        uploadId: doc._id.toHexString(),
        displayPutUrl: await signUploadUrl(
          doc.stagingDisplayKey,
          doc.declared.mimeType,
          doc.declared.displayBytes,
        ),
        thumbPutUrl: await signUploadUrl(
          doc.stagingThumbKey,
          doc.declared.mimeType,
          doc.declared.thumbBytes,
        ),
      })),
    );
    return { uploads, expiresAt: expiresAt.toISOString() };
  } catch (error) {
    // No URLs went out, so nobody can finish these: remove any rows and give every slot back.
    await PhotoUpload.deleteMany({
      weddingId: uploader.weddingId,
      _id: { $in: docs.map((doc) => doc._id) },
    });
    await releasePhotoSlots(uploader.weddingId, count);
    throw error;
  }
}

type Verified =
  { ok: true; displayEtag?: string; thumbEtag?: string } | { ok: false; reason: UploadFailure };

/**
 * Checks what was actually stored, never what was declared (SYSTEM_DESIGN §40): both objects exist,
 * have exactly the declared length (the signed URL bound it) and start with the declared format's
 * signature. The ETags pin the copy to the bytes that were checked.
 */
async function verifyStaged(upload: PhotoUploadDoc): Promise<Verified> {
  const [display, thumb] = await Promise.all([
    headObject(upload.stagingDisplayKey),
    headObject(upload.stagingThumbKey),
  ]);
  if (!display || !thumb) return { ok: false, reason: 'MISSING_OBJECT' };
  if (display.size !== upload.declared.displayBytes || thumb.size !== upload.declared.thumbBytes) {
    return { ok: false, reason: 'TOO_LARGE' };
  }
  const [displayStart, thumbStart] = await Promise.all([
    readObjectStart(upload.stagingDisplayKey, 16, display.etag),
    readObjectStart(upload.stagingThumbKey, 16, thumb.etag),
  ]);
  if (!displayStart || !thumbStart) return { ok: false, reason: 'MISSING_OBJECT' };
  const type = upload.declared.mimeType;
  if (sniffImageType(displayStart) !== type || sniffImageType(thumbStart) !== type) {
    return { ok: false, reason: 'NOT_AN_IMAGE' };
  }
  return { ok: true, displayEtag: display.etag, thumbEtag: thumb.etag };
}

/**
 * Removes pending uploads and gives back exactly the slots they held, in one transaction. Rows
 * already gone (published or released by someone else) release nothing. Returns how many went.
 */
export async function releaseUploads(
  weddingId: Types.ObjectId,
  ids: Types.ObjectId[],
  session?: ClientSession,
): Promise<number> {
  if (!ids.length) return 0;
  const run = async (s: ClientSession) => {
    const removed = await PhotoUpload.deleteMany({ weddingId, _id: { $in: ids } }, { session: s });
    await releasePhotoSlots(weddingId, removed.deletedCount, s);
    return removed.deletedCount;
  };
  return session ? run(session) : withTransaction(run);
}

export async function deleteStaging(uploads: PhotoUploadDoc[]): Promise<void> {
  try {
    await deleteObjects(uploads.flatMap((u) => [u.stagingDisplayKey, u.stagingThumbKey]));
  } catch {
    // Orphaned staging objects expire through the R2 lifecycle rule (DATABASE_DESIGN §5.12).
    console.error('[gallery] staging cleanup failed', { count: uploads.length });
  }
}

async function failUpload(upload: PhotoUploadDoc, reason: UploadFailure): Promise<UploadResult> {
  const released = await releaseUploads(upload.weddingId, [upload._id]);
  await deleteStaging([upload]);
  // Already gone means another request finished it first: report it as not pending.
  if (!released) return { uploadId: upload._id.toHexString(), status: 'UNKNOWN' };
  return { uploadId: upload._id.toHexString(), status: 'FAILED', reason };
}

async function completeOne(upload: PhotoUploadDoc, now: Date): Promise<UploadResult> {
  const uploadId = upload._id.toHexString();
  if (upload.expiresAt < now) return failUpload(upload, 'EXPIRED');

  const verified = await verifyStaged(upload);
  if (!verified.ok) return failUpload(upload, verified.reason);

  const final = photoKeys(upload.weddingId.toHexString(), upload.keyId);
  const type = upload.declared.mimeType;
  await Promise.all([
    copyObject(upload.stagingDisplayKey, final.display, type, verified.displayEtag),
    copyObject(upload.stagingThumbKey, final.thumb, type, verified.thumbEtag),
  ]);

  // Publish: the pending row goes and the photo row arrives together, so the reserved slot
  // becomes a used slot exactly once (DATABASE_DESIGN §8, §9.3).
  const photo = await withTransaction(async (session) => {
    const removed = await PhotoUpload.deleteOne(
      { weddingId: upload.weddingId, _id: upload._id },
      { session },
    );
    if (removed.deletedCount !== 1) return undefined;
    const [created] = await Photo.create(
      [
        {
          weddingId: upload.weddingId,
          ...(upload.eventId ? { eventId: upload.eventId } : {}),
          displayKey: final.display,
          thumbKey: final.thumb,
          width: upload.declared.width,
          height: upload.declared.height,
          displayBytes: upload.declared.displayBytes,
          thumbBytes: upload.declared.thumbBytes,
          mimeType: type,
          uploaderType: upload.uploaderType,
          ...(upload.uploaderUserId ? { uploaderUserId: upload.uploaderUserId } : {}),
          ...(upload.uploaderName ? { uploaderName: upload.uploaderName } : {}),
          featured: false,
        },
      ],
      { session },
    );
    return created!.toObject();
  });
  if (!photo) return { uploadId, status: 'UNKNOWN' };
  await deleteStaging([upload]);
  return { uploadId, status: 'PUBLISHED', photo: toPhotoResponse(photo) };
}

/**
 * `POST …/complete` (API_DESIGN §22.3): per-photo results, always 200, so one bad photo does not
 * fail the batch. Ids that are not pending in this wedding are `UNKNOWN`, never an error: a retried
 * request after a lost response must not publish anything twice. `filter` narrows which pending
 * uploads this caller may finish (guests: their own device).
 */
export async function completeUploads(
  scope: { weddingId: Types.ObjectId },
  uploadIds: string[],
  filter: Record<string, unknown> = {},
): Promise<CompleteUploadsResponse> {
  const ids = [...new Set(uploadIds.map((id) => id.toLowerCase()))];
  await connectDb();
  const uploads = await PhotoUpload.find({
    ...filter,
    weddingId: scope.weddingId,
    _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
  }).lean();
  const byId = new Map(uploads.map((upload) => [upload._id.toHexString(), upload]));

  const now = new Date();
  const results: UploadResult[] = [];
  for (let start = 0; start < ids.length; start += COMPLETE_CONCURRENCY) {
    const batch = ids.slice(start, start + COMPLETE_CONCURRENCY);
    results.push(
      ...(await Promise.all(
        batch.map((id) => {
          const upload = byId.get(id);
          return upload ? completeOne(upload, now) : { uploadId: id, status: 'UNKNOWN' as const };
        }),
      )),
    );
  }

  const published = results.filter((r) => r.status === 'PUBLISHED').length;
  const failed = results.filter((r) => r.status === 'FAILED').length;
  await countUploadOutcomes(scope.weddingId, { published, failed });
  return { results };
}

/** `POST …/cancel` (API_DESIGN §22.4): releases abandoned uploads. Unknown ids are ignored. */
export async function cancelUploads(
  scope: { weddingId: Types.ObjectId },
  uploadIds: string[],
  filter: Record<string, unknown> = {},
): Promise<void> {
  await connectDb();
  const uploads = await PhotoUpload.find({
    ...filter,
    weddingId: scope.weddingId,
    _id: { $in: uploadIds.map((id) => new Types.ObjectId(id)) },
  }).lean();
  if (!uploads.length) return;
  await releaseUploads(
    scope.weddingId,
    uploads.map((upload) => upload._id),
  );
  await deleteStaging(uploads);
}
