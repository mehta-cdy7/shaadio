import 'server-only';
import type { ClientSession } from 'mongoose';
import { connectDb } from './connection';

/**
 * Runs `fn` in a transaction with the driver's retry logic (DATABASE_DESIGN §8). Never call R2,
 * Resend or Google inside `fn`: a retried transaction would repeat the external call.
 */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const mongoose = await connectDb();
  return mongoose.connection.transaction(fn);
}
