import 'server-only';
import mongoose, { Schema } from 'mongoose';
import { hashToken } from '@/server/auth/tokens';
import { connectDb } from '@/server/db/connection';
import { AppError } from '@/server/http/errors';

/**
 * Fixed-window counters in MongoDB (SYSTEM_DESIGN §67, DATABASE_DESIGN §5.16). The key is HMACed,
 * so emails and IPs are never stored in plain text. Not tenant data: no weddingId.
 */
const rateLimitSchema = new Schema(
  {
    _id: { type: String, required: true },
    count: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false, collection: 'rate_limits' },
);
rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimit =
  (mongoose.models.RateLimit as mongoose.Model<{ _id: string; count: number; expiresAt: Date }>) ??
  mongoose.model('RateLimit', rateLimitSchema);

export type Limit = {
  scope: string;
  key: string;
  limit: number;
  windowSeconds: number;
  /** How much this attempt uses, e.g. the number of photos in an upload request. Default 1. */
  amount?: number;
};

/** Counts one attempt. Throws 429 RATE_LIMITED with Retry-After details when over the limit. */
export async function consume(
  { scope, key, limit, windowSeconds, amount = 1 }: Limit,
  now = new Date(),
) {
  await connectDb();
  const windowMs = windowSeconds * 1000;
  const windowStart = Math.floor(now.getTime() / windowMs) * windowMs;
  const expiresAt = new Date(windowStart + windowMs);
  const _id = hashToken(`${scope}:${key}:${windowStart}`);

  const retryAfterSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));
  const limited = (details: Record<string, number> = {}) =>
    new AppError('RATE_LIMITED', 'Too many attempts. Please wait and try again.', {
      retryAfterSeconds,
      ...details,
    });

  // Two first requests in one window can race on an upsert; retry once (DATABASE_DESIGN §5.16).
  const once = async <T>(write: () => Promise<T>): Promise<T> => {
    try {
      return await write();
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      return write();
    }
  };

  if (amount > 1) {
    // A batch (e.g. 30 photos) is taken whole or not at all, with the limit in the update filter:
    // concurrent batches can never overshoot, and a refused batch uses nothing, so a smaller one
    // still fits (DATABASE_DESIGN §9's "limits in the filter" rule).
    await once(() =>
      RateLimit.updateOne({ _id }, { $setOnInsert: { count: 0, expiresAt } }, { upsert: true }),
    );
    const taken = await RateLimit.updateOne(
      { _id, count: { $lte: limit - amount } },
      { $inc: { count: amount } },
    );
    if (taken.modifiedCount === 1) return;
    const current = await RateLimit.findOne({ _id }, { count: 1 }).lean();
    throw limited({ remaining: Math.max(0, limit - (current?.count ?? 0)) });
  }

  // Single attempts count even when refused, as login limits expect.
  const doc = await once(() =>
    RateLimit.findOneAndUpdate(
      { _id },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true, returnDocument: 'after', lean: true },
    ),
  );
  if (doc && doc.count > limit) throw limited();
}
