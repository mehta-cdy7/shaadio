import type { mongo } from 'mongoose';

/**
 * Indexes for member invitations (DATABASE_DESIGN §5.6). The token index is unique and unscoped:
 * accepting finds the invitation by token before the wedding is known (§6.3 #2). The partial
 * unique index allows one pending invitation per email per wedding. Idempotent.
 */
export async function up(db: mongo.Db): Promise<void> {
  const invitations = db.collection('member_invitations');
  await invitations.createIndex({ tokenHash: 1 }, { unique: true });
  await invitations.createIndex(
    { weddingId: 1, email: 1 },
    { unique: true, partialFilterExpression: { status: 'PENDING' } },
  );
  await invitations.createIndex({ weddingId: 1, status: 1 });
}
