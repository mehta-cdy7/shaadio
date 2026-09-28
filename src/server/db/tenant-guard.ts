import 'server-only';
import type { Aggregate, MongooseDefaultQueryMiddleware, Query, Schema } from 'mongoose';

/**
 * Tenant guard (DATABASE_DESIGN §6.2, DB-08). Apply to every tenant-scoped schema:
 *
 *   guestSchema.plugin(tenantGuard);
 *
 * Any query whose filter has no weddingId throws, so `Model.findById(id)` fails and
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

export function tenantGuard(schema: Schema): void {
  schema.pre([...GUARDED_QUERY_OPS], function (this: Query<unknown, unknown>) {
    if (this.getFilter().weddingId == null) {
      // `op` exists at runtime but is missing from Mongoose's Query type.
      const op = (this as unknown as { op?: string }).op ?? 'query';
      throw new UnscopedQueryError(
        `Unscoped ${op} on ${this.model.modelName}: the filter must include weddingId`,
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
    if (match?.weddingId == null) {
      throw new UnscopedQueryError('Unscoped aggregate: the first stage must $match weddingId');
    }
  });

  schema.pre('bulkWrite', function () {
    throw new UnscopedQueryError('bulkWrite bypasses the tenant guard; use targeted updates');
  });
}
