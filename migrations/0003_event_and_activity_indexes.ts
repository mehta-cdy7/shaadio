import type { mongo } from 'mongoose';

/**
 * Indexes for events and activity_logs (DATABASE_DESIGN §5.7, §5.15). Both lead with weddingId
 * (§17.2). Idempotent.
 */
export async function up(db: mongo.Db): Promise<void> {
  await db.collection('events').createIndex({ weddingId: 1, date: 1, startTime: 1 });
  await db.collection('activity_logs').createIndex({ weddingId: 1, createdAt: -1, _id: -1 });
}
