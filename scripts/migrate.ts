/**
 * `pnpm db:migrate` (DATABASE_DESIGN §17.1). Run by hand per environment, before deploying code
 * that depends on it; never at app startup. Refuses a production database unless `--production`
 * is passed, and a backup should be taken first (§18).
 *
 * Plain Node (type stripping), outside the Next build: it cannot import src/server, whose files
 * start with `import 'server-only'`.
 */
import mongoose from 'mongoose';
import { MIGRATIONS, runMigrations } from '../migrations/runner.ts';

function databaseName(uri: string): string | undefined {
  return /^mongodb(?:\+srv)?:\/\/[^/]+\/([^/?]+)/.exec(uri)?.[1];
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  // Never print the URI: it carries the database password.
  const dbName = uri ? databaseName(uri) : undefined;
  if (!uri || !dbName) {
    throw new Error('MONGODB_URI must be set and name the database, e.g. …/shaadioo-dev');
  }

  const looksProduction = process.env.NODE_ENV === 'production' || /prod/i.test(dbName);
  if (looksProduction && !process.argv.includes('--production')) {
    throw new Error(
      `Refusing to migrate "${dbName}": looks like production. Take a backup, then re-run with --production.`,
    );
  }

  await mongoose.connect(uri, {
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 10_000,
  });
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('connection has no database handle');
    console.log(`db:migrate → ${dbName} (${MIGRATIONS.length} known)`);
    const applied = await runMigrations(db, MIGRATIONS, (line) => console.log(`  ${line}`));
    console.log(applied.length ? `applied ${applied.length}` : 'nothing to apply');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`db:migrate failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
