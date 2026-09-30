import mongoose, { Schema, Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectDb } from './connection';
import { GUARDED_QUERY_OPS, tenantGuard, UnscopedQueryError } from './tenant-guard';

/**
 * Proves the tenant guard (DATABASE_DESIGN §6.2, §6.5). Uses test-only models; every real tenant
 * model must also get its own isolation tests in tests/security.
 */
const thingSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    name: { type: String, required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'GuardTestOwner' },
  },
  { timestamps: true, versionKey: false },
);
thingSchema.plugin(tenantGuard);

const ownerSchema = new Schema(
  { weddingId: { type: Schema.Types.ObjectId, required: true }, name: String },
  { versionKey: false },
);
ownerSchema.plugin(tenantGuard);

const Thing = mongoose.model('GuardTestThing', thingSchema);
const Owner = mongoose.model('GuardTestOwner', ownerSchema);

const weddingA = new Types.ObjectId();
const weddingB = new Types.ObjectId();

/** One call per guarded op, deliberately missing weddingId. */
const unscopedCalls: Record<(typeof GUARDED_QUERY_OPS)[number], () => Promise<unknown>> = {
  countDocuments: () => Thing.countDocuments({}),
  deleteMany: () => Thing.deleteMany({}),
  deleteOne: () => Thing.deleteOne({ name: 'a' }),
  distinct: () => Thing.distinct('name'),
  find: () => Thing.find({ name: 'a' }).lean(),
  findOne: () => Thing.findOne({ name: 'a' }).lean(),
  findOneAndDelete: () => Thing.findOneAndDelete({ name: 'a' }),
  findOneAndReplace: () =>
    Thing.findOneAndReplace({ name: 'a' }, { weddingId: weddingA, name: 'b' }),
  findOneAndUpdate: () => Thing.findOneAndUpdate({ name: 'a' }, { $set: { name: 'b' } }),
  replaceOne: () => Thing.replaceOne({ name: 'a' }, { weddingId: weddingA, name: 'b' }),
  updateMany: () => Thing.updateMany({}, { $set: { name: 'b' } }),
  updateOne: () => Thing.updateOne({ name: 'a' }, { $set: { name: 'b' } }),
};

describe('tenantGuard', () => {
  beforeAll(async () => {
    await connectDb();
  });

  beforeEach(async () => {
    // One wedding per call: the guard rejects `$in` across weddings.
    for (const weddingId of [weddingA, weddingB]) {
      await Thing.deleteMany({ weddingId });
      await Owner.deleteMany({ weddingId });
    }
    await Thing.create([
      { weddingId: weddingA, name: 'a' },
      { weddingId: weddingB, name: 'a' },
    ]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it.each(GUARDED_QUERY_OPS)('%s without weddingId throws', async (op) => {
    await expect(unscopedCalls[op]()).rejects.toBeInstanceOf(UnscopedQueryError);
  });

  it('findById throws, because it has no weddingId', async () => {
    const [doc] = await Thing.find({ weddingId: weddingA }).lean();
    await expect(Thing.findById(doc!._id)).rejects.toBeInstanceOf(UnscopedQueryError);
  });

  it('weddingId: null counts as unscoped', async () => {
    await expect(Thing.find({ weddingId: null })).rejects.toBeInstanceOf(UnscopedQueryError);
  });

  it.each([
    ['$ne', { $ne: weddingA }],
    ['$exists', { $exists: true }],
    ['$in', { $in: [weddingA, weddingB] }],
    ['$nin', { $nin: [weddingA] }],
    ['$gt', { $gt: new Types.ObjectId('000000000000000000000000') }],
    ['$not', { $not: { $eq: weddingA } }],
  ])('weddingId with %s matches other weddings, so it throws', async (_label, weddingId) => {
    await expect(Thing.find({ weddingId }).lean()).rejects.toBeInstanceOf(UnscopedQueryError);
    await expect(Thing.updateMany({ weddingId }, { $set: { name: 'x' } })).rejects.toBeInstanceOf(
      UnscopedQueryError,
    );
    await expect(Thing.aggregate([{ $match: { weddingId } }])).rejects.toBeInstanceOf(
      UnscopedQueryError,
    );
    expect(await Thing.countDocuments({ weddingId: weddingB, name: 'a' })).toBe(1);
  });

  it('weddingId as $eq or a hex string is scoped', async () => {
    expect(await Thing.find({ weddingId: { $eq: weddingA } }).lean()).toHaveLength(1);
    expect(await Thing.find({ weddingId: weddingA.toHexString() }).lean()).toHaveLength(1);
    const matched = await Thing.aggregate([{ $match: { weddingId: { $eq: weddingA } } }]);
    expect(matched).toHaveLength(1);
  });

  it('estimatedDocumentCount always throws', async () => {
    await expect(Thing.estimatedDocumentCount()).rejects.toBeInstanceOf(UnscopedQueryError);
  });

  it('bulkWrite always throws', async () => {
    await expect(
      // eslint-disable-next-line no-restricted-syntax -- proving the guard blocks it
      Thing.bulkWrite([{ deleteMany: { filter: { weddingId: weddingA } } }]),
    ).rejects.toBeInstanceOf(UnscopedQueryError);
  });

  it('an aggregate must start with $match weddingId', async () => {
    await expect(Thing.aggregate([{ $group: { _id: '$name' } }])).rejects.toBeInstanceOf(
      UnscopedQueryError,
    );
    await expect(
      Thing.aggregate([{ $sort: { name: 1 } }, { $match: { weddingId: weddingA } }]),
    ).rejects.toBeInstanceOf(UnscopedQueryError);

    const groups = await Thing.aggregate([
      { $match: { weddingId: weddingA } },
      { $group: { _id: '$name', n: { $sum: 1 } } },
    ]);
    expect(groups).toEqual([{ _id: 'a', n: 1 }]);
  });

  it('populate is blocked, because it queries the target without weddingId', async () => {
    const [owner] = await Owner.create([{ weddingId: weddingA, name: 'o' }]);
    await Thing.updateOne({ weddingId: weddingA, name: 'a' }, { $set: { ownerId: owner!._id } });

    await expect(
      // eslint-disable-next-line no-restricted-syntax -- proving the guard blocks it
      Thing.findOne({ weddingId: weddingA, name: 'a' }).populate('ownerId'),
    ).rejects.toBeInstanceOf(UnscopedQueryError);
  });

  it('scoped queries see only their own wedding', async () => {
    const own = await Thing.find({ weddingId: weddingA }).lean();
    expect(own).toHaveLength(1);
    expect(String(own[0]!.weddingId)).toBe(String(weddingA));

    const res = await Thing.updateMany({ weddingId: weddingA }, { $set: { name: 'renamed' } });
    expect(res.modifiedCount).toBe(1);
    expect(await Thing.countDocuments({ weddingId: weddingB, name: 'a' })).toBe(1);
  });

  it('inserts require weddingId', async () => {
    await expect(Thing.create({ name: 'orphan' })).rejects.toThrow(/weddingId/);
  });
});
