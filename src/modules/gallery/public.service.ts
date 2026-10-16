import 'server-only';
import type { Types } from 'mongoose';
import { galleryAlbums } from '@/modules/events';
import { findPublicGalleryWedding, type PublicGalleryWedding } from '@/modules/weddings';
import { hashToken } from '@/server/auth/tokens';
import { findActiveWeddingIdByGalleryToken } from '@/server/db/unscoped';
import { AppError } from '@/server/http/errors';
import { consume } from '@/server/rate-limit/rate-limit';
import { listPhotos } from './photo.service';
import {
  DEVICE_ID_PATTERN,
  DEVICE_PHOTOS_PER_DAY,
  IP_PHOTOS_PER_DAY,
  type GuestUploadRequestInput,
  type Photo,
  type PhotoListQuery,
  type PublicPhoto,
  type PublicGallery,
  type PublicPhotoListResponse,
  type UploadTicketsResponse,
  type CompleteUploadsResponse,
} from './schemas';
import { cancelUploads, completeUploads, requestUploads } from './upload.service';

/**
 * The guest gallery (API_DESIGN §25, SYSTEM_DESIGN §24): no session; possession of the gallery
 * token is the access, and the two member switches are checked on every request. Everything after
 * the token lookup is scoped by that wedding's id.
 */

const DAY_SECONDS = 24 * 60 * 60;

/** Unknown, malformed and deleting-wedding tokens all get this identical 404 (API_DESIGN §30). */
function unavailable(): AppError {
  return new AppError('NOT_FOUND', 'This link is not available.');
}

async function resolve(
  token: string,
): Promise<{ scope: { weddingId: Types.ObjectId }; wedding: PublicGalleryWedding }> {
  const weddingId = await findActiveWeddingIdByGalleryToken(token);
  if (!weddingId) throw unavailable();
  const wedding = await findPublicGalleryWedding(weddingId);
  if (!wedding) throw unavailable();
  return { scope: { weddingId }, wedding };
}

function uploadsOff(): AppError {
  return new AppError('UPLOADS_DISABLED', 'Uploads are turned off for this gallery.');
}

/** The browser's device id, HMAC-hashed before it is used or stored (API_DESIGN §7). */
function deviceHash(deviceId: string | null): string {
  if (!deviceId || !DEVICE_ID_PATTERN.test(deviceId)) {
    throw new AppError('VALIDATION_ERROR', 'Some fields are invalid.', {
      fields: { deviceId: 'Missing or invalid device id.' },
    });
  }
  return hashToken(`device:${deviceId}`);
}

function toPublicPhoto(photo: Photo): PublicPhoto {
  return {
    id: photo.id,
    thumbUrl: photo.thumbUrl,
    displayUrl: photo.displayUrl,
    width: photo.width,
    height: photo.height,
    ...(photo.eventId ? { eventId: photo.eventId } : {}),
    ...(photo.uploaderName ? { uploaderName: photo.uploaderName } : {}),
    createdAt: photo.createdAt,
  };
}

/** `GET /api/public/gallery/:token` and the server-rendered page. */
export async function getPublicGallery(token: string): Promise<PublicGallery> {
  const { scope, wedding } = await resolve(token);
  return {
    wedding: {
      brideName: wedding.brideName,
      groomName: wedding.groomName,
      nameOrder: wedding.nameOrder,
    },
    albums: await galleryAlbums(scope),
    viewEnabled: wedding.guestViewEnabled,
    uploadEnabled: wedding.guestUploadEnabled && !wedding.photosPurged,
    photosPurged: wedding.photosPurged,
  };
}

/**
 * `GET /api/public/gallery/:token/photos`: same pages as members, minus the featured flag and the
 * uploader type. `409 CONFLICT` while viewing is off; the page then offers uploading only.
 */
export async function listPublicPhotos(
  token: string,
  query: Pick<PhotoListQuery, 'eventId' | 'limit' | 'cursor'>,
): Promise<PublicPhotoListResponse> {
  const { scope, wedding } = await resolve(token);
  if (!wedding.guestViewEnabled) throw new AppError('CONFLICT', 'Viewing is turned off');
  const page = await listPhotos(scope, query);
  return {
    items: page.items.map(toPublicPhoto),
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
  };
}

/**
 * Guest `upload-requests` (API_DESIGN §22.1, guest column of §22.5). Order: access → declared
 * metadata (the route's schema) → device and IP daily limits → slot reservation.
 */
export async function requestGuestUploads(
  token: string,
  input: GuestUploadRequestInput,
  client: { deviceId: string | null; ip: string },
): Promise<UploadTicketsResponse> {
  const { scope, wedding } = await resolve(token);
  if (!wedding.guestUploadEnabled || wedding.photosPurged) throw uploadsOff();
  const deviceIdHash = deviceHash(client.deviceId);
  const amount = input.photos.length;
  await consume({
    scope: 'gallery-upload-device',
    key: deviceIdHash,
    limit: DEVICE_PHOTOS_PER_DAY,
    windowSeconds: DAY_SECONDS,
    amount,
  });
  await consume({
    scope: 'gallery-upload-ip',
    key: client.ip,
    limit: IP_PHOTOS_PER_DAY,
    windowSeconds: DAY_SECONDS,
    amount,
  });
  return requestUploads(
    {
      weddingId: scope.weddingId,
      uploaderType: 'GUEST',
      ...(input.uploaderName ? { uploaderName: input.uploaderName } : {}),
      deviceIdHash,
    },
    input,
  );
}

/**
 * Guest `complete`: only uploads this device started, and only while uploads are on. Uploads left
 * pending by a switch-off are released by the cleanup job.
 */
export async function completeGuestUploads(
  token: string,
  uploadIds: string[],
  deviceId: string | null,
): Promise<CompleteUploadsResponse> {
  const { scope, wedding } = await resolve(token);
  if (!wedding.guestUploadEnabled || wedding.photosPurged) throw uploadsOff();
  return completeUploads(scope, uploadIds, { deviceIdHash: deviceHash(deviceId) });
}

/** Guest `cancel`: this device's own pending uploads; allowed even after uploads are turned off. */
export async function cancelGuestUploads(
  token: string,
  uploadIds: string[],
  deviceId: string | null,
): Promise<void> {
  const { scope } = await resolve(token);
  await cancelUploads(scope, uploadIds, { deviceIdHash: deviceHash(deviceId) });
}
