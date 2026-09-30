import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { isSingleWeddingId } from './tenant-guard';

const id = new Types.ObjectId();

describe('isSingleWeddingId', () => {
  it.each([
    ['an ObjectId', id],
    ['a hex string', id.toHexString()],
    ['$eq an ObjectId', { $eq: id }],
    ['$eq a hex string', { $eq: id.toHexString() }],
  ])('accepts %s', (_label, value) => {
    expect(isSingleWeddingId(value)).toBe(true);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['$ne', { $ne: id }],
    ['$exists', { $exists: true }],
    ['$in', { $in: [id] }],
    ['$nin', { $nin: [id] }],
    ['$gt', { $gt: id }],
    ['$gte and $lte', { $gte: id, $lte: id }],
    ['$not', { $not: { $eq: id } }],
    ['$regex', { $regex: '.*' }],
    ['a RegExp', /.*/],
    ['$type', { $type: 'objectId' }],
    ['$eq plus another operator', { $eq: id, $ne: id }],
    ['$eq null', { $eq: null }],
    ['$eq an operator object', { $eq: { $ne: id } }],
    ['an array', [id]],
    ['a non-hex string', 'not-an-id'],
    ['a number', 42],
    ['an empty object', {}],
  ])('rejects %s', (_label, value) => {
    expect(isSingleWeddingId(value)).toBe(false);
  });
});
