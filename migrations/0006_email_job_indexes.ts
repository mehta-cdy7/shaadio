import type { mongo } from 'mongoose';

/**
 * Indexes for email jobs (DATABASE_DESIGN §5.14). The status index is global: the worker claims
 * across weddings (§6.3 #6). Finished jobs expire through `purgeAt`. Idempotent.
 */
export async function up(db: mongo.Db): Promise<void> {
  const jobs = db.collection('email_jobs');
  await jobs.createIndex({ idempotencyKey: 1 }, { unique: true });
  await jobs.createIndex({ status: 1, createdAt: 1 });
  await jobs.createIndex({ weddingId: 1, campaignId: 1, status: 1 });
  await jobs.createIndex({ weddingId: 1, guestId: 1 });
  await jobs.createIndex({ purgeAt: 1 }, { expireAfterSeconds: 0 });
}
