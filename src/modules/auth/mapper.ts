import 'server-only';
import type { UserResponse } from './schemas';
import type { UserDoc } from './user.model';

export function toUserResponse(user: Pick<UserDoc, '_id' | 'name' | 'email'>): UserResponse {
  return { id: user._id.toHexString(), name: user.name, email: user.email };
}
