import 'server-only';
import type { Types } from 'mongoose';
import { markPhotosPurged } from '@/modules/weddings';
import { connectDb } from '@/server/db/connection';
import {
  countExpiredPhotoUploads,
  countWeddingsPastPhotoRetention,
  findExpiredPhotoUploads,
  findWeddingsPastPhotoRetention,
} from '@/server/db/unscoped';
import { photosPrefix, stagingPrefix } from '@/server/storage/keys';
import { deleteObjects, deletePrefix } from '@/server/storage/storage';
import { Photo } from './photo.model';
import { PhotoUpload } from './photo-upload.model';
import { photoRetentionCutoff } from './schemas';
import { releaseUploads } from './upload.service';

/**
 * The daily photo jobs (API_DESIGN §27, SYSTEM_DESIGN §54). Each is idempotent, works in small
 * batches, and stops before `deadline` (the function's time limit) to leave the rest for the next
 * run. Lookups across weddings go through `unscoped.ts` (#7, #8); everything after is scoped.
 */

export type JobReport = { processed: number; remaining: number; durationMs: number };

const UPLOAD_BATCH = 200;
const WEDDING_BATCH = 5;

/**
 * Expired upload reservations (DATABASE_DESIGN §14.6): delete their staging objects, then delete
 * the rows and give their slots back together. A row published or cancelled meanwhile releases
 * nothing. Orphaned staging objects beyond these are left to the R2 lifecycle rule (§12).
 */
export async function cleanupExpiredUploads(
  deadline: number,
  now = new Date(),
): Promise<JobReport> {
  const started = Date.now();
  let processed = 0;
  let failed = 0;
  while (Date.now() < deadline) {
    const expired = await findExpiredPhotoUploads(now, UPLOAD_BATCH);
    if (!expired.length) break;

    const byWedding = new Map<string, { weddingId: Types.ObjectId; ids: Types.ObjectId[] }>();
    for (const { uploadId, weddingId } of expired) {
      const key = weddingId.toHexString();
      const group = byWedding.get(key) ?? { weddingId, ids: [] };
      group.ids.push(uploadId);
      byWedding.set(key, group);
    }
    for (const { weddingId, ids } of byWedding.values()) {
      await connectDb();
      const uploads = await PhotoUpload.find({
        weddingId,
        _id: { $in: ids },
        expiresAt: { $lt: now },
      }).lean();
      // Files first. If R2 fails, this wedding's rows and slots stay and the next run tries
      // again; the R2 lifecycle rule on staging/ is only the backstop (DATABASE_DESIGN §12).
      try {
        await deleteObjects(uploads.flatMap((u) => [u.stagingDisplayKey, u.stagingThumbKey]));
      } catch {
        failed += uploads.length;
        console.error('[gallery] staging cleanup failed; will retry', { count: uploads.length });
        continue;
      }
      processed += await releaseUploads(
        weddingId,
        uploads.map((upload) => upload._id),
      );
    }
    // A failed batch would come straight back: stop and leave it for the next run.
    if (failed || expired.length < UPLOAD_BATCH) break;
  }
  return {
    processed,
    remaining: await countExpiredPhotoUploads(now),
    durationMs: Date.now() - started,
  };
}

/**
 * Photo retention (DATABASE_DESIGN §14.7): for weddings dated more than 12 months ago, delete the
 * photo files, then the photo and pending-upload rows, then mark the wedding purged. Covers stay
 * (they live under `covers/`). New uploads were already refused past the cutoff, so nothing is
 * added while this runs. A wedding that fails is logged and retried next run.
 */
export async function runPhotoRetention(deadline: number, now = new Date()): Promise<JobReport> {
  const started = Date.now();
  const cutoff = photoRetentionCutoff(now);
  let processed = 0;
  const failed = new Set<string>();

  while (Date.now() < deadline) {
    const weddings = (await findWeddingsPastPhotoRetention(cutoff, WEDDING_BATCH + failed.size))
      .filter((id) => !failed.has(id.toHexString()))
      .slice(0, WEDDING_BATCH);
    if (!weddings.length) break;
    for (const weddingId of weddings) {
      if (Date.now() >= deadline) break;
      try {
        const id = weddingId.toHexString();
        await deletePrefix(photosPrefix(id));
        await deletePrefix(stagingPrefix(id));
        await connectDb();
        await Photo.deleteMany({ weddingId });
        await PhotoUpload.deleteMany({ weddingId });
        await markPhotosPurged(weddingId, now);
        processed += 1;
      } catch (error) {
        failed.add(weddingId.toHexString());
        console.error('[gallery] photo retention failed for a wedding', {
          error: error instanceof Error ? error.name : 'unknown',
        });
      }
    }
  }
  return {
    processed,
    remaining: await countWeddingsPastPhotoRetention(cutoff),
    durationMs: Date.now() - started,
  };
}
