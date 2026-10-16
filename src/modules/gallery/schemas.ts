import { z } from 'zod';

/**
 * Request and response shapes for photos and gallery settings (API_DESIGN §21, §22). Client-safe:
 * shared with the upload pipeline that runs in the browser.
 */

/** Limits from PRD §9.22, SYSTEM_DESIGN §97 and API_DESIGN §22.1. */
export const PHOTO_LIMIT = 2000;
export const FEATURED_LIMIT = 12;
export const PHOTOS_PER_REQUEST = 30;
/** The file the user selects; checked in the browser only, the server never sees it. */
export const SELECTED_FILE_MAX_BYTES = 15 * 1024 * 1024;
export const DISPLAY_MAX_BYTES = 4 * 1024 * 1024;
export const THUMB_MAX_BYTES = 300 * 1024;
export const DISPLAY_MAX_SIDE = 2560;
export const THUMB_MAX_SIDE = 640;
export const UPLOADER_NAME_MAX = 60;
export const PHOTO_PAGE_SIZE_DEFAULT = 40;
export const PHOTO_PAGE_SIZE_MAX = 100;

export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/webp', 'image/png'] as const;
export type PhotoMimeType = (typeof PHOTO_MIME_TYPES)[number];

export const UPLOADER_TYPES = ['MEMBER', 'GUEST'] as const;
export type UploaderType = (typeof UPLOADER_TYPES)[number];

/** `eventId=none` lists the "Other / Wedding Memories" album (API_DESIGN §21). */
export const NO_EVENT = 'none';

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'Not a valid id.');

const dimension = z.number().int().min(1).max(DISPLAY_MAX_SIDE);

const declaredPhoto = z.strictObject({
  mimeType: z.enum(PHOTO_MIME_TYPES),
  displayBytes: z.number().int().min(1).max(DISPLAY_MAX_BYTES),
  thumbBytes: z.number().int().min(1).max(THUMB_MAX_BYTES),
  width: dimension,
  height: dimension,
});
export type DeclaredPhoto = z.output<typeof declaredPhoto>;

/** `POST /api/photos/upload-requests` (API_DESIGN §22.1). Members send no name: it is theirs. */
export const uploadRequestSchema = z.strictObject({
  eventId: objectId.optional(),
  photos: z.array(declaredPhoto).min(1).max(PHOTOS_PER_REQUEST),
});
export type UploadRequestInput = z.output<typeof uploadRequestSchema>;

/** `POST …/complete` and `…/cancel` (API_DESIGN §22.3, §22.4). */
export const uploadIdsSchema = z.strictObject({
  uploadIds: z.array(objectId).min(1).max(PHOTOS_PER_REQUEST),
});

/** `PATCH /api/photos/:id` (API_DESIGN §21): `eventId: null` moves the photo to "Other". */
export const updatePhotoSchema = z
  .strictObject({
    featured: z.boolean().optional(),
    eventId: objectId.nullable().optional(),
  })
  .refine((input) => input.featured !== undefined || input.eventId !== undefined, {
    message: 'Nothing to change.',
  });
export type UpdatePhotoInput = z.output<typeof updatePhotoSchema>;

/** `PATCH /api/gallery/settings` (API_DESIGN §21). */
export const updateGallerySettingsSchema = z
  .strictObject({
    guestViewEnabled: z.boolean().optional(),
    guestUploadEnabled: z.boolean().optional(),
  })
  .refine(
    (input) => input.guestViewEnabled !== undefined || input.guestUploadEnabled !== undefined,
    { message: 'Nothing to change.' },
  );

/** `GET /api/photos` query (API_DESIGN §5.2, §21). Shared by the route and the Photos page. */
export const photoListQuerySchema = z.strictObject({
  eventId: z.union([z.literal(NO_EVENT), objectId]).optional(),
  featured: z.literal('true').optional(),
  uploaderType: z.enum(UPLOADER_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(PHOTO_PAGE_SIZE_MAX).optional(),
  cursor: z.string().max(500).optional(),
});
export type PhotoListQuery = z.output<typeof photoListQuerySchema>;

export type Photo = {
  id: string;
  thumbUrl: string;
  displayUrl: string;
  width: number;
  height: number;
  eventId?: string;
  uploaderType: UploaderType;
  uploaderName?: string;
  featured: boolean;
  createdAt: string;
};

export type PhotoListResponse = { items: Photo[]; nextCursor?: string };

export type UploadTicketsResponse = {
  uploads: { uploadId: string; displayPutUrl: string; thumbPutUrl: string }[];
  expiresAt: string;
};

export const UPLOAD_FAILURES = ['MISSING_OBJECT', 'TOO_LARGE', 'NOT_AN_IMAGE', 'EXPIRED'] as const;
export type UploadFailure = (typeof UPLOAD_FAILURES)[number];

export type UploadResult =
  | { uploadId: string; status: 'PUBLISHED'; photo: Photo }
  | { uploadId: string; status: 'FAILED'; reason: UploadFailure }
  | { uploadId: string; status: 'UNKNOWN' };

export type CompleteUploadsResponse = { results: UploadResult[] };

export type GallerySettings = {
  galleryUrl: string;
  guestViewEnabled: boolean;
  guestUploadEnabled: boolean;
  photosUsed: number;
  photoLimit: number;
  photosPurgedAt?: string;
};
