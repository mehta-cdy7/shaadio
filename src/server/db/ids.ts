import 'server-only';
import { isValidObjectId, Types } from 'mongoose';

/**
 * A path id as an ObjectId, or undefined when it is not one. Callers answer 404 for undefined,
 * the same as for an id that exists only in another wedding (API_DESIGN §3.3).
 */
export function toObjectId(id: string): Types.ObjectId | undefined {
  return /^[0-9a-f]{24}$/i.test(id) && isValidObjectId(id) ? new Types.ObjectId(id) : undefined;
}
