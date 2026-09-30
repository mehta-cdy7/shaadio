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

const RateLimit =
  (mongoose.models.RateLimit as mongoose.Model<{ _id: string; count: number; expiresAt: Date }>) ??
  mongoose.model('RateLimit', rateLimitSchema);

export type Limit = { scope: string; key: string; limit: number; windowSeconds: number };

/** Counts one attempt. Throws 429 RATE_LIMITED with Retry-After details when over the limit. */
export async function consume({ scope, key, limit, windowSeconds }: Limit, now = new Date()) {
  await connectDb();
  const windowMs = windowSeconds * 1000;
  const windowStart = Math.floor(now.getTime() / windowMs) * windowMs;
  const expiresAt = new Date(windowStart + windowMs);
  const _id = hashToken(`${scope}:${key}:${windowStart}`);

  const increment = () =>
    RateLimit.findOneAndUpdate(
      { _id },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { upsert: true, returnDocument: 'after', lean: true },
    );

  let doc;
  try {
    doc = await increment();
  } catch (error) {
    // Two first requests in one window can race on the upsert; retry once (DATABASE_DESIGN §5.16).
    if ((error as { code?: number }).code !== 11000) throw error;
    doc = await increment();
  }

  if (doc && doc.count > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000));
    throw new AppError('RATE_LIMITED', 'Too many attempts. Please wait and try again.', {
      retryAfterSeconds,
    });
  }
}
