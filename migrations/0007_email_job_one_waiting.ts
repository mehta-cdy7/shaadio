import type { mongo } from 'mongoose';

/**
 * One waiting email per guest and kind (DATABASE_DESIGN §5.14): two campaigns queued at the same
 * moment, or a retry next to a newer campaign, cannot leave two jobs that both send. Idempotent.
 */
export async function up(db: mongo.Db): Promise<void> {
  await db.collection('email_jobs').createIndex(
    { weddingId: 1, guestId: 1, kind: 1 },
    {
      unique: true,
      partialFilterExpression: { status: { $in: ['PENDING', 'PROCESSING'] } },
      name: 'one_waiting_per_guest',
    },
  );
}
