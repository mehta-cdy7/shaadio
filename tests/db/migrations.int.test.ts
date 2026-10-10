import { randomBytes } from 'node:crypto';
import type { mongo } from 'mongoose';
import { afterEach, describe, expect, it } from 'vitest';
import { MIGRATIONS_COLLECTION, runMigrations } from '../../migrations/runner';
import { connectDb } from '@/server/db/connection';

/**
 * The migration runner and its migrations (DATABASE_DESIGN §5, §17.1). Each test gets its own empty
 * database, so Mongoose autoIndex on the shared test database cannot create the indexes for it.
 */
const dbs: mongo.Db[] = [];

async function freshDb(): Promise<mongo.Db> {
  const conn = await connectDb();
  const db = conn.connection.useDb(`migrations-${randomBytes(4).toString('hex')}`).db;
  if (!db) throw new Error('no database handle');
  dbs.push(db);
  return db;
}

async function indexKeys(db: mongo.Db, collection: string) {
  return (await db.collection(collection).indexes()).map((i) => ({
    key: i.key,
    ...(i.unique && { unique: true }),
    ...(i.expireAfterSeconds !== undefined && { ttl: i.expireAfterSeconds }),
  }));
}

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.dropDatabase()));
});

describe('runMigrations', () => {
  it('creates the auth indexes and records the migration', async () => {
    const db = await freshDb();
    expect(await runMigrations(db)).toEqual([
      '0001_auth_indexes',
      '0002_wedding_indexes',
      '0003_event_and_activity_indexes',
      '0004_guest_indexes',
      '0005_member_invitation_indexes',
    ]);

    expect(await indexKeys(db, 'users')).toContainEqual({ key: { email: 1 }, unique: true });
    const sessions = await indexKeys(db, 'sessions');
    expect(sessions).toContainEqual({ key: { tokenHash: 1 }, unique: true });
    expect(sessions).toContainEqual({ key: { userId: 1 } });
    expect(sessions).toContainEqual({ key: { expiresAt: 1 }, ttl: 0 });
    expect(await indexKeys(db, 'rate_limits')).toContainEqual({ key: { expiresAt: 1 }, ttl: 0 });

    const records = await db.collection(MIGRATIONS_COLLECTION).find().toArray();
    expect(records.map((r) => r._id)).toEqual([
      '0001_auth_indexes',
      '0002_wedding_indexes',
      '0003_event_and_activity_indexes',
      '0004_guest_indexes',
      '0005_member_invitation_indexes',
    ]);
  });

  it('creates the wedding and membership indexes', async () => {
    const db = await freshDb();
    await runMigrations(db);
    const weddings = await indexKeys(db, 'weddings');
    expect(weddings).toContainEqual({ key: { 'website.slug': 1 }, unique: true });
    expect(weddings).toContainEqual({ key: { 'gallery.token': 1 }, unique: true });
    expect(weddings).toContainEqual({ key: { status: 1 } });
    expect(weddings).toContainEqual({ key: { weddingDate: 1 } });
    const memberships = await indexKeys(db, 'wedding_memberships');
    expect(memberships).toContainEqual({ key: { userId: 1 }, unique: true });
    expect(memberships).toContainEqual({ key: { weddingId: 1, role: 1 } });
  });

  it('creates the event and activity indexes', async () => {
    const db = await freshDb();
    await runMigrations(db);
    expect(await indexKeys(db, 'events')).toContainEqual({
      key: { weddingId: 1, date: 1, startTime: 1 },
    });
    expect(await indexKeys(db, 'activity_logs')).toContainEqual({
      key: { weddingId: 1, createdAt: -1, _id: -1 },
    });
  });

  it('creates the guest indexes', async () => {
    const db = await freshDb();
    await runMigrations(db);
    const guests = await indexKeys(db, 'guests');
    expect(guests).toContainEqual({ key: { 'inviteLink.token': 1 }, unique: true });
    expect(guests).toContainEqual({ key: { weddingId: 1, name: 1 } });
    expect(guests).toContainEqual({ key: { weddingId: 1, 'invitedEvents.eventId': 1 } });
    expect(guests).toContainEqual({ key: { weddingId: 1, phone: 1 } });
  });

  it('creates the member invitation indexes', async () => {
    const db = await freshDb();
    await runMigrations(db);
    const invitations = await indexKeys(db, 'member_invitations');
    expect(invitations).toContainEqual({ key: { tokenHash: 1 }, unique: true });
    expect(invitations).toContainEqual({ key: { weddingId: 1, email: 1 }, unique: true });
    expect(invitations).toContainEqual({ key: { weddingId: 1, status: 1 } });
  });

  it('skips migrations already applied', async () => {
    const db = await freshDb();
    await runMigrations(db);
    expect(await runMigrations(db)).toEqual([]);
  });

  it('makes a second user with the same email impossible', async () => {
    const db = await freshDb();
    await runMigrations(db);
    await db.collection('users').insertOne({ email: 'priya@example.com', name: 'Priya' });
    await expect(
      db.collection('users').insertOne({ email: 'priya@example.com', name: 'Again' }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('does not record a migration that fails, so the next run retries it', async () => {
    const db = await freshDb();
    // Existing duplicates stop the unique index from building.
    await db.collection('users').insertMany([
      { email: 'dup@example.com', name: 'A' },
      { email: 'dup@example.com', name: 'B' },
    ]);
    await expect(runMigrations(db)).rejects.toMatchObject({ code: 11000 });
    expect(await db.collection(MIGRATIONS_COLLECTION).countDocuments()).toBe(0);

    await db.collection('users').deleteOne({ name: 'B' });
    expect(await runMigrations(db)).toEqual([
      '0001_auth_indexes',
      '0002_wedding_indexes',
      '0003_event_and_activity_indexes',
      '0004_guest_indexes',
      '0005_member_invitation_indexes',
    ]);
  });
});
