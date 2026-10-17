import 'server-only';
import type { Types } from 'mongoose';
import { connectDb } from './connection';

/**
 * Unscoped data access: the ONLY module allowed to bypass the tenant guard (DATABASE_DESIGN §6.3,
 * DB-08). These lookups run before the wedding is known, because they are how the wedding is
 * found. They use the native driver (`connection.db.collection('<name>')`) by collection name, so
 * this infrastructure file never imports domain modules. ESLint forbids `.collection` everywhere else.
 *
 * Allowed lookups — this list IS the tenant-isolation audit, together with the tenant-guard test:
 *
 *   1. Resolve current wedding        wedding_memberships by userId       → continue scoped
 *   2. Accept member invitation       member_invitations by tokenHash     → scoped by its weddingId
 *   3. Public invitation page         guests by inviteLink.token          → check wedding ACTIVE
 *   4. Public website                 weddings by website.slug            → check published + ACTIVE
 *   5. Public gallery                 weddings by gallery.token           → check ACTIVE + switches
 *   6. Email worker claim             email_jobs by status/lease          → each job carries weddingId
 *   7. Upload cleanup                 photo_uploads by expiresAt          → each carries weddingId
 *   8. Deletion and retention jobs    tenant collections by weddingId of a DELETING/expired wedding
 *   9. Migrations                     run by an operator from migrations/, never by the app
 *
 * Adding a tenth lookup needs explicit approval and a matching entry in DATABASE_DESIGN §6.3.
 * Each lookup lands with the feature that needs it.
 */

export type MembershipRef = {
  weddingId: Types.ObjectId;
  role: 'ADMIN' | 'MANAGER';
  label?: string;
};

/**
 * Lookup 1: the caller's membership, found by `userId` alone (unique: one wedding per user). The
 * caller continues scoped with the returned `weddingId` and must still check the wedding is ACTIVE.
 */
export async function findMembershipByUserId(
  userId: Types.ObjectId,
): Promise<MembershipRef | undefined> {
  const mongoose = await connectDb();
  const doc = await mongoose.connection
    .db!.collection('wedding_memberships')
    .findOne({ userId }, { projection: { _id: 0, weddingId: 1, role: 1, label: 1 } });
  if (!doc) return undefined;
  return {
    weddingId: doc.weddingId as Types.ObjectId,
    role: doc.role as MembershipRef['role'],
    ...(typeof doc.label === 'string' ? { label: doc.label } : {}),
  };
}

/**
 * Lookup 3: the guest an invitation link belongs to, found by `inviteLink.token` alone (unique).
 * Returns only the ids; the caller continues scoped with `weddingId` and must still check the
 * wedding is ACTIVE. A token that is not a 22-character base64url string is not looked up.
 */
export async function findGuestByInviteToken(
  token: string,
): Promise<{ guestId: Types.ObjectId; weddingId: Types.ObjectId } | undefined> {
  if (!/^[A-Za-z0-9_-]{22}$/.test(token)) return undefined;
  const mongoose = await connectDb();
  const doc = await mongoose.connection
    .db!.collection('guests')
    .findOne({ 'inviteLink.token': token }, { projection: { _id: 1, weddingId: 1 } });
  if (!doc) return undefined;
  return { guestId: doc._id as Types.ObjectId, weddingId: doc.weddingId as Types.ObjectId };
}

/**
 * Lookup 2: the member invitation a link belongs to, found by `tokenHash` alone (unique). Returns
 * only the ids; the caller continues scoped with `weddingId`, checks status and expiry, and checks
 * the wedding is ACTIVE.
 */
export async function findMemberInvitationByTokenHash(
  tokenHash: string,
): Promise<{ invitationId: Types.ObjectId; weddingId: Types.ObjectId } | undefined> {
  const mongoose = await connectDb();
  const doc = await mongoose.connection
    .db!.collection('member_invitations')
    .findOne({ tokenHash }, { projection: { _id: 1, weddingId: 1 } });
  if (!doc) return undefined;
  return { invitationId: doc._id as Types.ObjectId, weddingId: doc.weddingId as Types.ObjectId };
}

/**
 * Lookup 4: the wedding behind a public website slug (unique). Only a published, ACTIVE wedding is
 * found: a draft, a deleting wedding and an unknown slug are all the same undefined (SYSTEM §26).
 * Returns only the id; the caller continues by that id. A slug that is not lowercase letters,
 * digits and dashes is not looked up.
 */
export async function findPublishedWeddingIdBySlug(
  slug: string,
): Promise<Types.ObjectId | undefined> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return undefined;
  const mongoose = await connectDb();
  const doc = await mongoose.connection
    .db!.collection('weddings')
    .findOne(
      { 'website.slug': slug, 'website.published': true, status: 'ACTIVE' },
      { projection: { _id: 1 } },
    );
  return doc ? (doc._id as Types.ObjectId) : undefined;
}

/**
 * Lookup 5: the wedding behind a gallery link (unique `gallery.token`), only while ACTIVE (SYSTEM
 * §24). Returns only the id; the caller continues scoped by it and checks the guest switches. A
 * token that is not a 22-character base64url string is not looked up.
 */
export async function findActiveWeddingIdByGalleryToken(
  token: string,
): Promise<Types.ObjectId | undefined> {
  if (!/^[A-Za-z0-9_-]{22}$/.test(token)) return undefined;
  const mongoose = await connectDb();
  const doc = await mongoose.connection
    .db!.collection('weddings')
    .findOne({ 'gallery.token': token, status: 'ACTIVE' }, { projection: { _id: 1 } });
  return doc ? (doc._id as Types.ObjectId) : undefined;
}

/**
 * Lookup 7: pending photo uploads past `expiresAt`, across weddings (DATABASE_DESIGN §14.6), oldest
 * first. Returns only ids; the cleanup continues scoped by each one's `weddingId`.
 */
export async function findExpiredPhotoUploads(
  now: Date,
  limit: number,
): Promise<{ uploadId: Types.ObjectId; weddingId: Types.ObjectId }[]> {
  const mongoose = await connectDb();
  const docs = await mongoose.connection
    .db!.collection('photo_uploads')
    .find({ expiresAt: { $lt: now } }, { projection: { _id: 1, weddingId: 1 } })
    .sort({ expiresAt: 1 })
    .limit(limit)
    .toArray();
  return docs.map((doc) => ({
    uploadId: doc._id as Types.ObjectId,
    weddingId: doc.weddingId as Types.ObjectId,
  }));
}

/** Lookup 7, read-only: how many expired uploads are left, for the job's report. */
export async function countExpiredPhotoUploads(now: Date): Promise<number> {
  const mongoose = await connectDb();
  return mongoose.connection
    .db!.collection('photo_uploads')
    .countDocuments({ expiresAt: { $lt: now } });
}

/**
 * Lookup 8: ACTIVE weddings whose photos are past retention (DATABASE_DESIGN §14.7): wedding date
 * before `cutoff` ("YYYY-MM-DD", a plain string comparison) and not yet purged. Ids only; the job
 * continues scoped by each.
 */
export async function findWeddingsPastPhotoRetention(
  cutoff: string,
  limit: number,
): Promise<Types.ObjectId[]> {
  const mongoose = await connectDb();
  const docs = await mongoose.connection
    .db!.collection('weddings')
    .find(
      { status: 'ACTIVE', weddingDate: { $lt: cutoff }, photosPurgedAt: { $exists: false } },
      { projection: { _id: 1 } },
    )
    .sort({ weddingDate: 1 })
    .limit(limit)
    .toArray();
  return docs.map((doc) => doc._id as Types.ObjectId);
}

/** Lookup 8, read-only: weddings still waiting for retention, for the job's report. */
export async function countWeddingsPastPhotoRetention(cutoff: string): Promise<number> {
  const mongoose = await connectDb();
  return mongoose.connection.db!.collection('weddings').countDocuments({
    status: 'ACTIVE',
    weddingDate: { $lt: cutoff },
    photosPurgedAt: { $exists: false },
  });
}

export type ClaimedEmailJob = {
  jobId: Types.ObjectId;
  weddingId: Types.ObjectId;
  guestId: Types.ObjectId;
  campaignId: Types.ObjectId;
  kind: string;
  attempts: number;
};

const EMAIL_LEASE_MS = 5 * 60 * 1000;

/**
 * Lookup 6: the email worker claims up to `limit` jobs across all weddings (DATABASE_DESIGN §5.14,
 * SYSTEM_DESIGN §53): pending jobs, or processing jobs whose lease ran out because a previous run
 * died. Candidates are claimed conditionally, so two overlapping runs can never both win a job, and
 * only the jobs this claim actually won are returned. Each carries its `weddingId`; everything
 * after the claim is scoped by it.
 */
export async function claimEmailJobs(
  limit: number,
  claimId: string,
  now = new Date(),
): Promise<ClaimedEmailJob[]> {
  if (limit <= 0) return [];
  const mongoose = await connectDb();
  const jobs = mongoose.connection.db!.collection('email_jobs');
  const claimable = {
    $or: [{ status: 'PENDING' }, { status: 'PROCESSING', lockedUntil: { $lt: now } }],
  };
  const candidates = await jobs
    .find(claimable, { projection: { _id: 1 } })
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();
  if (!candidates.length) return [];
  const ids = candidates.map((candidate) => candidate._id);
  await jobs.updateMany(
    { _id: { $in: ids }, ...claimable },
    {
      $set: {
        status: 'PROCESSING',
        claimId,
        lockedUntil: new Date(now.getTime() + EMAIL_LEASE_MS),
        lastAttemptAt: now,
      },
      $inc: { attempts: 1 },
    },
  );
  const mine = await jobs
    .find(
      { _id: { $in: ids }, claimId, status: 'PROCESSING' },
      { projection: { weddingId: 1, guestId: 1, campaignId: 1, kind: 1, attempts: 1 } },
    )
    .sort({ createdAt: 1 })
    .toArray();
  return mine.map((doc) => ({
    jobId: doc._id as Types.ObjectId,
    weddingId: doc.weddingId as Types.ObjectId,
    guestId: doc.guestId as Types.ObjectId,
    campaignId: doc.campaignId as Types.ObjectId,
    kind: doc.kind as string,
    attempts: doc.attempts as number,
  }));
}

/** Lookup 6, read-only: jobs still waiting across all weddings, for the worker's report. */
export async function countWaitingEmailJobs(): Promise<number> {
  const mongoose = await connectDb();
  return mongoose.connection
    .db!.collection('email_jobs')
    .countDocuments({ status: { $in: ['PENDING', 'PROCESSING'] } });
}
