import type { mongo } from 'mongoose';

/**
 * Indexes for weddings and wedding_memberships (DATABASE_DESIGN §5.4, §5.5). The unique
 * `userId` index on memberships is the one-wedding-per-user rule, so it must exist before
 * `POST /api/wedding` ships. Idempotent.
 */
export async function up(db: mongo.Db): Promise<void> {
  const weddings = db.collection('weddings');
  await weddings.createIndex({ 'website.slug': 1 }, { unique: true });
  await weddings.createIndex({ 'gallery.token': 1 }, { unique: true });
  await weddings.createIndex({ status: 1 });
  await weddings.createIndex({ weddingDate: 1 });

  const memberships = db.collection('wedding_memberships');
  await memberships.createIndex({ userId: 1 }, { unique: true });
  await memberships.createIndex({ weddingId: 1, role: 1 });
}
