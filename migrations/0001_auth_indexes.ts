import type { mongo } from 'mongoose';

/**
 * Indexes for users, sessions and rate_limits (DATABASE_DESIGN §5.1, §5.2, §5.16). Idempotent:
 * createIndex with the same spec and options is a no-op. The unique email index is what makes two
 * concurrent signups with one email impossible, so it must exist before signup ships.
 */
export async function up(db: mongo.Db): Promise<void> {
  await db.collection('users').createIndex({ email: 1 }, { unique: true });

  await db.collection('sessions').createIndex({ tokenHash: 1 }, { unique: true });
  await db.collection('sessions').createIndex({ userId: 1 });
  await db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  await db.collection('rate_limits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}
