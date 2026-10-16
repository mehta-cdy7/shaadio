import type { mongo } from 'mongoose';

/**
 * Indexes for photos and pending uploads (DATABASE_DESIGN §5.12, §5.13). `photo_uploads.expiresAt`
 * is a plain index, not TTL: the cleanup job releases the slot and staging objects (§14.6).
 * Idempotent.
 */
export async function up(db: mongo.Db): Promise<void> {
  const photos = db.collection('photos');
  await photos.createIndex({ weddingId: 1, createdAt: -1, _id: -1 });
  await photos.createIndex({ weddingId: 1, eventId: 1, createdAt: -1, _id: -1 });
  await photos.createIndex(
    { weddingId: 1, featuredAt: -1 },
    { partialFilterExpression: { featured: true } },
  );

  const uploads = db.collection('photo_uploads');
  await uploads.createIndex({ weddingId: 1, createdAt: 1 });
  await uploads.createIndex({ expiresAt: 1 });
}
