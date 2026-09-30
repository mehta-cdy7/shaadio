import 'server-only';
import type { Types } from 'mongoose';
import {
  hashPassword,
  isCommonPassword,
  verifyAgainstDummy,
  verifyPassword,
} from '@/server/auth/password';
import { SESSION_TTL_SECONDS } from '@/server/auth/session-cookie';
import { hashToken, newToken } from '@/server/auth/tokens';
import { connectDb } from '@/server/db/connection';
import { withTransaction } from '@/server/db/transaction';
import { AppError } from '@/server/http/errors';
import { consume } from '@/server/rate-limit/rate-limit';
import { toUserResponse } from './mapper';
import type { LoginInput, MeResponse, SignupInput, UserResponse } from './schemas';
import { Session } from './session.model';
import { User } from './user.model';

const TTL_MS = SESSION_TTL_SECONDS * 1000;
/** `expiresAt` slides only when the session was last seen over a day ago (DATABASE_DESIGN §5.2). */
const SLIDE_AFTER_MS = 24 * 60 * 60 * 1000;

const MINUTE = 60;
const HOUR = 60 * MINUTE;

/** Result of signup and login: the response body plus the token for the cookie. */
export type AuthResult = { me: MeResponse; token: string };

export async function signup(input: SignupInput, ip: string): Promise<AuthResult> {
  await consume({ scope: 'signup', key: ip, limit: 10, windowSeconds: HOUR });

  if (isCommonPassword(input.password)) {
    throw new AppError('VALIDATION_ERROR', 'Some fields are invalid.', {
      fields: { password: 'This password is too common. Choose another.' },
    });
  }

  // Hash outside the transaction: it is slow and needs no database.
  const passwordHash = await hashPassword(input.password);
  const token = newToken();
  const now = new Date();

  try {
    const user = await withTransaction(async (session) => {
      const [created] = await User.create(
        [{ name: input.name, email: input.email, passwordHash }],
        { session },
      );
      await Session.create([sessionFields(created!._id, token, now)], { session });
      return created!;
    });
    return { me: { user: toUserResponse(user) }, token };
  } catch (error) {
    // The unique email index decides, so two concurrent signups cannot both succeed.
    if ((error as { code?: number }).code === 11000) {
      throw new AppError('EMAIL_TAKEN', 'An account with this email already exists.');
    }
    throw error;
  }
}

export async function login(input: LoginInput, ip: string): Promise<AuthResult> {
  await consume({ scope: 'login-ip', key: ip, limit: 30, windowSeconds: 15 * MINUTE });
  await consume({ scope: 'login', key: input.email, limit: 10, windowSeconds: 15 * MINUTE });

  await connectDb();
  const user = await User.findOne({ email: input.email }).select('+passwordHash').lean();
  const ok = user
    ? await verifyPassword(input.password, user.passwordHash)
    : await verifyAgainstDummy(input.password);
  if (!user || !ok) {
    // Same code, message and timing for an unknown email and a wrong password (API_DESIGN §10).
    throw new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }

  const token = newToken();
  const now = new Date();
  await withTransaction(async (session) => {
    await Session.create([sessionFields(user._id, token, now)], { session });
    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: now } }, { session });
  });
  return { me: { user: toUserResponse(user) }, token };
}

export async function logout(token: string | undefined): Promise<void> {
  if (!token) return;
  await connectDb();
  await Session.deleteOne({ tokenHash: hashToken(token) });
}

export type SessionUser = {
  user: UserResponse;
  userId: Types.ObjectId;
  /** True when this request slid the expiry; the caller re-sends the cookie with a fresh Max-Age. */
  refreshed: boolean;
};

/** Resolves a session token to its user, or undefined when absent, unknown or expired. */
export async function resolveSession(
  token: string | undefined,
  now = new Date(),
): Promise<SessionUser | undefined> {
  if (!token) return undefined;
  await connectDb();

  const session = await Session.findOne({
    tokenHash: hashToken(token),
    // TTL deletion is not exact, so expiry is checked here too.
    expiresAt: { $gt: now },
  }).lean();
  if (!session) return undefined;

  const user = await User.findOne({ _id: session.userId }).lean();
  if (!user) return undefined;

  let refreshed = false;
  if (now.getTime() - session.lastSeenAt.getTime() > SLIDE_AFTER_MS) {
    await Session.updateOne(
      { _id: session._id },
      { $set: { lastSeenAt: now, expiresAt: new Date(now.getTime() + TTL_MS) } },
    );
    refreshed = true;
  }

  return { user: toUserResponse(user), userId: user._id, refreshed };
}

function sessionFields(userId: Types.ObjectId, token: string, now: Date) {
  return {
    tokenHash: hashToken(token),
    userId,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + TTL_MS),
  };
}
