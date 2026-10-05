import type { mongo } from 'mongoose';

/**
 * Indexes for guests (DATABASE_DESIGN §5.8). The token index is unique and unscoped: the public
 * invitation page finds a guest by token before the wedding is known (§6.3). The name index uses
 * the guest list's case-insensitive collation, so it serves that sort. Idempotent.
 */
export async function up(db: mongo.Db): Promise<void> {
  const guests = db.collection('guests');
  await guests.createIndex({ 'inviteLink.token': 1 }, { unique: true });
  await guests.createIndex({ weddingId: 1, name: 1 }, { collation: { locale: 'en', strength: 2 } });
  await guests.createIndex({ weddingId: 1, 'invitedEvents.eventId': 1 });
  await guests.createIndex({ weddingId: 1, phone: 1 });
}
