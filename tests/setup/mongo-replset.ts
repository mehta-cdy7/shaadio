import { MongoMemoryReplSet } from 'mongodb-memory-server';

/**
 * Vitest global setup for integration tests. A single-node replica set, because transactions
 * (DATABASE_DESIGN §8) do not work on a standalone mongod. Workers inherit the env set here.
 */
let replSet: MongoMemoryReplSet | undefined;

export async function setup(): Promise<void> {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.MONGODB_URI = replSet.getUri('shaadioo-test');
  process.env.APP_ORIGIN ??= 'http://localhost:3000';
  process.env.SESSION_SECRET ??= 'integration-test-session-secret-0123456789';
}

export async function teardown(): Promise<void> {
  await replSet?.stop();
}
