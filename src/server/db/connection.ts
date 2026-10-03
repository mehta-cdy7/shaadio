import 'server-only';
import mongoose from 'mongoose';
import { env } from '@/server/env';

/**
 * One cached Mongoose connection per warm serverless instance (SYSTEM_DESIGN §55). The pool is kept
 * small so many concurrent instances cannot exhaust the Atlas connection limit.
 */
type ConnectionCache = { promise: Promise<typeof mongoose> | null; uri?: string };

const globalForMongo = globalThis as typeof globalThis & { __shaadiooMongo?: ConnectionCache };
const cache: ConnectionCache = (globalForMongo.__shaadiooMongo ??= { promise: null });

export function connectDb(): Promise<typeof mongoose> {
  const { MONGODB_URI, NODE_ENV } = env();
  if (cache.promise && cache.uri === MONGODB_URI) return cache.promise;

  // `next dev` reloads .env.local but keeps globalThis, so a cached connection would keep using
  // the old URI (and database) until a restart. When the URI changes, close the old connection
  // first, then open the new one on the same mongoose instance. Production never changes it.
  const previous = cache.promise?.then((m) => m.disconnect()).catch(() => undefined);
  cache.uri = MONGODB_URI;
  const attempt: Promise<typeof mongoose> = Promise.resolve(previous)
    .then(() =>
      mongoose.connect(MONGODB_URI, {
        maxPoolSize: 5,
        serverSelectionTimeoutMS: 5_000,
        bufferCommands: false,
        // Production indexes are created by migrations, never at cold start (DATABASE_DESIGN §17.2).
        autoIndex: NODE_ENV !== 'production',
      }),
    )
    .catch((error: unknown) => {
      // Let the next request retry, unless a newer attempt (URI changed meanwhile) already replaced
      // this one: clearing that would start a second connect on the same mongoose instance.
      if (cache.promise === attempt) cache.promise = null;
      throw error;
    });
  cache.promise = attempt;
  return attempt;
}

/** True when the database answers a ping within the timeout. Never throws. */
export async function pingDb(timeoutMs = 3_000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`ping timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    await Promise.race([
      (async () => {
        const conn = await connectDb();
        const db = conn.connection.db;
        if (!db) throw new Error('connection has no database handle');
        await db.admin().command({ ping: 1 });
      })(),
      timeout,
    ]);
    return true;
  } catch (error) {
    // Log the error class only: driver messages can include host names.
    console.error('[db] ping failed', { error: error instanceof Error ? error.name : 'unknown' });
    return false;
  } finally {
    clearTimeout(timer);
  }
}
