import 'server-only';
import type { ClientSession, Types } from 'mongoose';
import type { z } from 'zod';
import {
  FEATURED_LIMIT,
  PHOTO_LIMIT,
  type GallerySettings,
  type updateGallerySettingsSchema,
} from '@/modules/gallery/schemas';
import { connectDb } from '@/server/db/connection';
import { env } from '@/server/env';
import { AppError } from '@/server/http/errors';
import { Wedding } from './wedding.model';

/**
 * The wedding's gallery settings and its two photo counters (DATABASE_DESIGN §9.3, §9.4). The
 * counters live on the wedding, so only this module writes them; the gallery module calls these.
 */

const ACTIVE = 'ACTIVE' as const;

function noWedding(): AppError {
  return new AppError('NO_WEDDING', 'You are not part of a wedding.');
}

/** What the QR code encodes (SYSTEM_DESIGN §25): stable, never rotated. */
export function galleryUrl(token: string): string {
  return `${env().APP_ORIGIN}/gallery/${token}`;
}

const SETTINGS_FIELDS = {
  'gallery.token': 1,
  'gallery.guestViewEnabled': 1,
  'gallery.guestUploadEnabled': 1,
  'counters.photoSlotsUsed': 1,
  photosPurgedAt: 1,
} as const;

type SettingsDoc = {
  gallery: { token: string; guestViewEnabled: boolean; guestUploadEnabled: boolean };
  counters: { photoSlotsUsed: number };
  photosPurgedAt?: Date | null;
};

function toGallerySettings(doc: SettingsDoc): GallerySettings {
  return {
    galleryUrl: galleryUrl(doc.gallery.token),
    guestViewEnabled: doc.gallery.guestViewEnabled,
    guestUploadEnabled: doc.gallery.guestUploadEnabled,
    photosUsed: doc.counters.photoSlotsUsed,
    photoLimit: PHOTO_LIMIT,
    ...(doc.photosPurgedAt ? { photosPurgedAt: doc.photosPurgedAt.toISOString() } : {}),
  };
}

/** `GET /api/gallery/settings` (API_DESIGN §21): any member. */
export async function getGallerySettings(ctx: {
  weddingId: Types.ObjectId;
}): Promise<GallerySettings> {
  await connectDb();
  const doc = await Wedding.findOne({ _id: ctx.weddingId, status: ACTIVE }, SETTINGS_FIELDS)
    .select('+gallery.token')
    .lean<SettingsDoc>();
  if (!doc) throw noWedding();
  return toGallerySettings(doc);
}

/** `PATCH /api/gallery/settings` (API_DESIGN §21): one targeted update. Not logged (§5.15). */
export async function updateGallerySettings(
  ctx: { weddingId: Types.ObjectId },
  input: z.output<typeof updateGallerySettingsSchema>,
): Promise<GallerySettings> {
  const set: Record<string, boolean> = {};
  if (input.guestViewEnabled !== undefined)
    set['gallery.guestViewEnabled'] = input.guestViewEnabled;
  if (input.guestUploadEnabled !== undefined) {
    set['gallery.guestUploadEnabled'] = input.guestUploadEnabled;
  }
  await connectDb();
  const doc = await Wedding.findOneAndUpdate(
    { _id: ctx.weddingId, status: ACTIVE },
    { $set: set },
    { returnDocument: 'after', projection: SETTINGS_FIELDS },
  )
    .select('+gallery.token')
    .lean<SettingsDoc>();
  if (!doc) throw noWedding();
  return toGallerySettings(doc);
}

/**
 * Reserves `count` photo slots before any upload URL is issued (DATABASE_DESIGN §9.3). The limit is
 * in the update filter, so concurrent requests can never overshoot. Returns the free slots left
 * when the reservation did not fit.
 */
export async function reservePhotoSlots(
  weddingId: Types.ObjectId,
  count: number,
): Promise<{ reserved: true } | { reserved: false; remaining: number }> {
  await connectDb();
  const result = await Wedding.updateOne(
    { _id: weddingId, status: ACTIVE, 'counters.photoSlotsUsed': { $lte: PHOTO_LIMIT - count } },
    { $inc: { 'counters.photoSlotsUsed': count, 'uploadStats.requested': count } },
  );
  if (result.modifiedCount === 1) return { reserved: true };
  const doc = await Wedding.findOne(
    { _id: weddingId, status: ACTIVE },
    { 'counters.photoSlotsUsed': 1 },
  ).lean();
  if (!doc) throw noWedding();
  return { reserved: false, remaining: Math.max(0, PHOTO_LIMIT - doc.counters.photoSlotsUsed) };
}

/**
 * Releases `count` slots: a failed, expired or cancelled upload, or a deleted photo (§9.3). Never
 * below zero. Pass the session when the release belongs to a transaction.
 */
export async function releasePhotoSlots(
  weddingId: Types.ObjectId,
  count: number,
  session?: ClientSession,
): Promise<void> {
  if (count <= 0) return;
  await Wedding.updateOne(
    { _id: weddingId },
    [
      {
        $set: {
          'counters.photoSlotsUsed': {
            $max: [0, { $subtract: ['$counters.photoSlotsUsed', count] }],
          },
        },
      },
    ],
    { session, updatePipeline: true },
  );
}

/**
 * +1 when a photo is featured, −1 when unfeatured or deleted (§9.4), inside the caller's
 * transaction. Featuring fails (false) at 12, which must abort the transaction.
 */
export async function changeFeaturedCount(
  session: ClientSession,
  weddingId: Types.ObjectId,
  delta: 1 | -1,
): Promise<boolean> {
  const filter =
    delta > 0
      ? { _id: weddingId, 'counters.featuredPhotoCount': { $lt: FEATURED_LIMIT } }
      : { _id: weddingId, 'counters.featuredPhotoCount': { $gt: 0 } };
  const result = await Wedding.updateOne(
    filter,
    { $inc: { 'counters.featuredPhotoCount': delta } },
    { session },
  );
  return result.modifiedCount === 1 || delta < 0;
}

/** Diagnostic upload outcomes (SYSTEM_DESIGN §63): never used to enforce anything. */
export async function countUploadOutcomes(
  weddingId: Types.ObjectId,
  outcome: { published?: number; failed?: number },
): Promise<void> {
  const inc: Record<string, number> = {};
  if (outcome.published) inc['uploadStats.published'] = outcome.published;
  if (outcome.failed) inc['uploadStats.failed'] = outcome.failed;
  if (!Object.keys(inc).length) return;
  await Wedding.updateOne({ _id: weddingId }, { $inc: inc });
}

export type PublicGalleryWedding = {
  brideName: string;
  groomName: string;
  nameOrder: 'BRIDE_FIRST' | 'GROOM_FIRST';
  guestViewEnabled: boolean;
  guestUploadEnabled: boolean;
  photosPurged: boolean;
};

/**
 * What a guest's gallery page may know about the wedding (API_DESIGN §25), after the token lookup
 * (DATABASE_DESIGN §6.3 #5). Undefined once the wedding is no longer ACTIVE.
 */
export async function findPublicGalleryWedding(
  weddingId: Types.ObjectId,
): Promise<PublicGalleryWedding | undefined> {
  await connectDb();
  const doc = await Wedding.findOne(
    { _id: weddingId, status: ACTIVE },
    {
      _id: 0,
      brideName: 1,
      groomName: 1,
      nameOrder: 1,
      'gallery.guestViewEnabled': 1,
      'gallery.guestUploadEnabled': 1,
      photosPurgedAt: 1,
    },
  ).lean();
  if (!doc) return undefined;
  return {
    brideName: doc.brideName,
    groomName: doc.groomName,
    nameOrder: doc.nameOrder,
    guestViewEnabled: doc.gallery.guestViewEnabled,
    guestUploadEnabled: doc.gallery.guestUploadEnabled,
    photosPurged: Boolean(doc.photosPurgedAt),
  };
}
