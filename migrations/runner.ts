import type { mongo } from 'mongoose';
import * as authIndexes from './0001_auth_indexes.ts';
import * as weddingIndexes from './0002_wedding_indexes.ts';
import * as eventIndexes from './0003_event_and_activity_indexes.ts';

/**
 * Applies unapplied migrations in order and records each in `schema_migrations` (DATABASE_DESIGN
 * §17.1). A migration is recorded only after `up` resolves, so a failed one is retried next run;
 * that is safe because every migration is idempotent.
 *
 * New migrations are registered here by hand, in order. tests/db/migrations.test.ts fails if a
 * file in this folder is missing from the list.
 */
export type Migration = { id: string; up: (db: mongo.Db) => Promise<void> };

export const MIGRATIONS: readonly Migration[] = [
  { id: '0001_auth_indexes', up: authIndexes.up },
  { id: '0002_wedding_indexes', up: weddingIndexes.up },
  { id: '0003_event_and_activity_indexes', up: eventIndexes.up },
];

export const MIGRATIONS_COLLECTION = 'schema_migrations';

type MigrationRecord = { _id: string; appliedAt: Date };

/** Runs what is pending and returns the ids it applied, in order. */
export async function runMigrations(
  db: mongo.Db,
  migrations: readonly Migration[] = MIGRATIONS,
  log: (line: string) => void = () => {},
): Promise<string[]> {
  const records = db.collection<MigrationRecord>(MIGRATIONS_COLLECTION);
  const done = new Set(
    (await records.find({}, { projection: { _id: 1 } }).toArray()).map((r) => r._id),
  );

  const applied: string[] = [];
  for (const migration of migrations) {
    if (done.has(migration.id)) continue;
    log(`applying ${migration.id}`);
    await migration.up(db);
    await records.updateOne(
      { _id: migration.id },
      { $setOnInsert: { appliedAt: new Date() } },
      { upsert: true },
    );
    applied.push(migration.id);
  }
  return applied;
}
