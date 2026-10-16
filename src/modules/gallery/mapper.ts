import 'server-only';
import { publicUrl } from '@/server/storage/storage';
import type { PhotoDoc } from './photo.model';
import type { Photo } from './schemas';

/**
 * Document → API `Photo` (API_DESIGN §21). URLs are `MEDIA_BASE_URL + key`, built on every read,
 * so moving the media domain needs no data change (API-11).
 */
export function toPhotoResponse(doc: PhotoDoc): Photo {
  return {
    id: doc._id.toHexString(),
    thumbUrl: publicUrl(doc.thumbKey),
    displayUrl: publicUrl(doc.displayKey),
    width: doc.width,
    height: doc.height,
    ...(doc.eventId ? { eventId: doc.eventId.toHexString() } : {}),
    uploaderType: doc.uploaderType,
    ...(doc.uploaderName ? { uploaderName: doc.uploaderName } : {}),
    featured: doc.featured,
    createdAt: doc.createdAt.toISOString(),
  };
}
