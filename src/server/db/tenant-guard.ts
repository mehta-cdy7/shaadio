import 'server-only';
import { isObjectIdOrHexString, Types } from 'mongoose';
import type { Aggregate, MongooseDefaultQueryMiddleware, Query, Schema } from 'mongoose';

/**
 * Tenant guard (DATABASE_DESIGN §6.2, DB-08). Apply to every tenant-scoped schema:
 *
 *   guestSchema.plugin(tenantGuard);
 *
 * Any query whose filter does not pin weddingId to exactly one wedding throws, so `Model.findById(id)` fails and
 * `Model.findOne({ _id: id, weddingId })` is required. Aggregates must start with
 * `$match: { weddingId }`. populate() is blocked too, because it issues an unscoped find.
 *
 * Inserts are covered by `weddingId` being required in every tenant schema.
 * Lookups that legitimately run before the wedding is known live in ./unscoped.ts.
 */
export const GUARDED_QUERY_OPS = [
  'countDocuments',
  'deleteMany',
  'deleteOne',
  'distinct',
  'find',
  'findOne',
  'findOneAndDelete',
  'findOneAndReplace',
  'findOneAndUpdate',
  'replaceOne',
  'updateMany',
  'updateOne',
] as const satisfies readonly MongooseDefaultQueryMiddleware[];

export class UnscopedQueryError extends Error {
  override name = 'UnscopedQueryError';
}

/**
 * True when `value` matches exactly one wedding: an ObjectId, its hex string, or `{ $eq: <that> }`.
 * Presence alone is not enough: `{ $ne: id }`, `{ $exists: true }`, `{ $in: [...] }`, `{ $gt: ... }`
 * or a regex would match other weddings' documents, so they are rejected.
 */
export function isSingleWeddingId(value: unknown): boolean {
  if (value instanceof Types.ObjectId) return true;
  if (typeof value === 'string') return isObjectIdOrHexString(value);
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === '$eq') {
      const eq = (value as { $eq: unknown }).$eq;
      return eq instanceof Types.ObjectId || (typeof eq === 'string' && isObjectIdOrHexString(eq));
    }
  }
  return false;
}

export function tenantGuard(schema: Schema): void {
  schema.pre([...GUARDED_QUERY_OPS], function (this: Query<unknown, unknown>) {
    if (!isSingleWeddingId(this.getFilter().weddingId)) {
      // `op` exists at runtime but is missing from Mongoose's Query type.
      const op = (this as unknown as { op?: string }).op ?? 'query';
      throw new UnscopedQueryError(
        `Unscoped ${op} on ${this.model.modelName}: the filter must pin weddingId to one wedding`,
      );
    }
  });

  schema.pre('estimatedDocumentCount', function (this: Query<unknown, unknown>) {
    throw new UnscopedQueryError(
      `estimatedDocumentCount on ${this.model.modelName} cannot be scoped; use countDocuments({ weddingId })`,
    );
  });

  schema.pre('aggregate', function (this: Aggregate<unknown>) {
    const first: unknown = this.pipeline()[0];
    const match =
      first !== null && typeof first === 'object' && '$match' in first
        ? (first as { $match: Record<string, unknown> }).$match
        : undefined;
    if (!isSingleWeddingId(match?.weddingId)) {
      throw new UnscopedQueryError(
        'Unscoped aggregate: the first stage must $match weddingId to one wedding',
      );
    }
  });

  schema.pre('bulkWrite', function () {
    throw new UnscopedQueryError('bulkWrite bypasses the tenant guard; use targeted updates');
  });
}
