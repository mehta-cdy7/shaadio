import 'server-only';
import { randomBytes } from 'node:crypto';
import { Types, type ClientSession } from 'mongoose';
import type { z } from 'zod';
import { findUsers } from '@/modules/auth';
import { invitationEvents } from '@/modules/events';
import {
  emailAudience,
  guestForEmail,
  inviteUrl,
  parseGuestId,
  recordEmailDelivery,
  type EmailGuest,
} from '@/modules/guests';
import type { GuestResponse } from '@/modules/guests/schemas';
import { findInvitationWedding, type InvitationWedding } from '@/modules/weddings';
import { sendEmail, sendEmailBatch, type Email } from '@/server/email/email';
import { campaignEmailsPerDay, giveBack, quotaResetsAt, takeCampaign } from '@/server/email/quota';
import { connectDb } from '@/server/db/connection';
import { toObjectId } from '@/server/db/ids';
import { withTransaction } from '@/server/db/transaction';
import { claimEmailJobs, countWaitingEmailJobs } from '@/server/db/unscoped';
import { AppError } from '@/server/http/errors';
import { EMAIL_JOB_MAX_ATTEMPTS, EmailJob } from './email-job.model';
import { guestInvitationEmail } from './guest-invitation-email';
import type {
  Campaign,
  CampaignList,
  createCampaignSchema,
  CreatedCampaign,
  EmailJobReport,
} from './schemas';

type Scope = { weddingId: Types.ObjectId };
type EmailCtx = Scope & { userId: Types.ObjectId; user: { name: string } };
type CreateCampaign = z.output<typeof createCampaignSchema>;

/** Finished jobs are removed 90 days later (DATABASE_DESIGN §5.14). */
const PURGE_AFTER_MS = 90 * 24 * 60 * 60 * 1000;
/** The provider's batch call takes at most 100 emails (SYSTEM_DESIGN §51). */
const BATCH_MAX = 100;
const WAITING = ['PENDING', 'PROCESSING'] as const;

function purgeAt(now: Date): Date {
  return new Date(now.getTime() + PURGE_AFTER_MS);
}

/**
 * The invitation email for one guest, or the reason it cannot be built. Read at send time, so a
 * changed email address or event list is always current (DATABASE_DESIGN §5.14).
 */
async function buildInvitation(
  scope: Scope,
  guest: EmailGuest,
  wedding: InvitationWedding,
): Promise<Email | 'NO_EMAIL' | 'NO_EVENTS'> {
  if (!guest.email) return 'NO_EMAIL';
  const events = await invitationEvents(scope, guest.invitedEventIds);
  if (!events.length) return 'NO_EVENTS';
  return guestInvitationEmail({
    to: guest.email,
    guestName: guest.name,
    wedding: {
      brideName: wedding.brideName,
      groomName: wedding.groomName,
      nameOrder: wedding.nameOrder,
      weddingDate: wedding.weddingDate,
      city: wedding.location.city,
      ...(wedding.rsvpDeadline ? { rsvpDeadline: wedding.rsvpDeadline } : {}),
    },
    events: events.map((event) => ({ name: event.name, date: event.date })),
    inviteUrl: inviteUrl(guest.inviteToken),
  });
}

// --- One guest, sent now -------------------------------------------------------------------------

/**
 * `POST /api/guests/:id/send-invitation-email` (API_DESIGN §16): sent immediately, never queued
 * (SYSTEM_DESIGN §46). Uses campaign capacity, so it never dips into the transactional reserve.
 * Delivery is recorded first-one-wins: a guest already shared on WhatsApp keeps that channel.
 */
export async function sendGuestInvitationEmail(ctx: EmailCtx, id: string): Promise<GuestResponse> {
  const guestId = parseGuestId(id);
  const guest = await guestForEmail(ctx, guestId);
  const wedding = await findInvitationWedding(ctx.weddingId);
  if (!guest || !wedding) throw new AppError('NOT_FOUND', 'Guest not found.');

  const email = await buildInvitation(ctx, guest, wedding);
  if (email === 'NO_EMAIL') {
    throw new AppError('VALIDATION_ERROR', 'This guest has no email address.', {
      fields: { email: 'Add an email address first.' },
    });
  }
  if (email === 'NO_EVENTS') {
    throw new AppError('NO_EVENTS', 'This guest is not invited to any event.');
  }

  if ((await takeCampaign(1)) === 0) {
    throw new AppError('EMAIL_QUOTA_EXHAUSTED', "Today's email limit is reached.", {
      resetsAt: quotaResetsAt().toISOString(),
    });
  }
  if (!(await sendEmail(email, 'guest-invitation'))) {
    await giveBack(1);
    throw new AppError('EMAIL_PROVIDER_ERROR', 'The email could not be sent. Please try again.');
  }
  const updated = await recordEmailDelivery(ctx, guestId);
  if (!updated) throw new AppError('NOT_FOUND', 'Guest not found.');
  // Sent now, so a queued campaign email for this guest must not follow it.
  await EmailJob.updateMany(
    { weddingId: ctx.weddingId, guestId, status: 'PENDING' },
    { $set: { status: 'CANCELLED', purgeAt: purgeAt(new Date()) } },
  );
  return updated;
}

/** Guests with an invitation email waiting in the queue (hex ids). */
export async function queuedGuestIds(scope: Scope): Promise<string[]> {
  await connectDb();
  const ids = await EmailJob.distinct('guestId', {
    weddingId: scope.weddingId,
    status: { $in: WAITING },
  });
  return ids.map((id: Types.ObjectId) => id.toHexString());
}

/** How many guests a new invitation campaign would queue now: the audience minus queued guests. */
export async function queueableGuestCount(scope: Scope): Promise<number> {
  const [audience, queued] = await Promise.all([emailAudience(scope), queuedGuestIds(scope)]);
  const waiting = new Set(queued);
  return audience.recipients.filter((item) => !waiting.has(item.guestId.toHexString())).length;
}

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: number }).code === 11000;
}

/**
 * Inserts jobs one by one so a guest already waiting (duplicate key on the one-waiting-job index)
 * is skipped, not fatal. Returns how many were queued.
 */
async function insertWaitingJobs(docs: Array<Record<string, unknown>>): Promise<number> {
  try {
    const created = await EmailJob.insertMany(docs, { ordered: false });
    return created.length;
  } catch (error) {
    const inserted = (error as { insertedDocs?: unknown[] }).insertedDocs;
    const writeErrors = (
      error as { writeErrors?: Array<{ code?: number; err?: { code?: number } }> }
    ).writeErrors;
    const allDuplicates = writeErrors?.every((item) => (item.code ?? item.err?.code) === 11000);
    if (!allDuplicates) throw error;
    return inserted?.length ?? docs.length - writeErrors!.length;
  }
}

// --- Campaigns -----------------------------------------------------------------------------------

async function campaigns(scope: Scope, campaignId?: Types.ObjectId): Promise<Campaign[]> {
  await connectDb();
  const rows = await EmailJob.aggregate<{
    _id: Types.ObjectId;
    kind: Campaign['kind'];
    createdAt: Date;
    createdByUserId: Types.ObjectId;
    statuses: string[];
  }>([
    { $match: { weddingId: scope.weddingId, ...(campaignId ? { campaignId } : {}) } },
    {
      $group: {
        _id: '$campaignId',
        kind: { $first: '$kind' },
        createdAt: { $min: '$createdAt' },
        createdByUserId: { $first: '$createdByUserId' },
        statuses: { $push: '$status' },
      },
    },
    { $sort: { createdAt: -1, _id: -1 } },
    { $limit: 20 },
  ]);
  const users = await findUsers([...new Set(rows.map((row) => row.createdByUserId))]);
  const perDay = campaignEmailsPerDay();
  return rows.map((row) => {
    const counts = { pending: 0, processing: 0, sent: 0, failed: 0, cancelled: 0 };
    for (const status of row.statuses) {
      counts[status.toLowerCase() as keyof typeof counts] += 1;
    }
    return {
      id: row._id.toHexString(),
      kind: row.kind,
      counts,
      estimatedDaysRemaining: Math.ceil((counts.pending + counts.processing) / perDay),
      createdBy: {
        userId: row.createdByUserId.toHexString(),
        name: users.get(row.createdByUserId.toHexString())?.name ?? '',
      },
      createdAt: row.createdAt.toISOString(),
    };
  });
}

/** `GET /api/email-campaigns` (API_DESIGN §16): the 20 most recent, newest first. */
export async function listCampaigns(scope: Scope): Promise<CampaignList> {
  return { items: await campaigns(scope) };
}

/**
 * `POST /api/email-campaigns` (API_DESIGN §16): queues one job per guest who has an email, is
 * invited to at least one event and is not delivered yet. Guests already waiting in another
 * campaign are skipped, so nobody is queued twice. Answers "queued", never "sent".
 */
export async function createCampaign(
  ctx: EmailCtx,
  input: CreateCampaign,
): Promise<CreatedCampaign> {
  await connectDb();
  const audience = await emailAudience(ctx);
  const wanted = input.guestIds ? new Set(input.guestIds.map((id) => id.toLowerCase())) : undefined;
  const recipients = wanted
    ? audience.recipients.filter((item) => wanted.has(item.guestId.toHexString()))
    : audience.recipients;

  const noEmail = wanted
    ? audience.noEmail.filter((id) => wanted.has(id.toHexString())).length
    : audience.noEmail.length;

  const queued = new Set(await queuedGuestIds(ctx));
  const fresh = recipients.filter((item) => !queued.has(item.guestId.toHexString()));
  const nothingToSend = (alreadyQueued: number) =>
    new AppError('CONFLICT', 'There is no one to email right now.', {
      reason: 'NOTHING_TO_SEND',
      skipped: { noEmail, alreadyQueued },
    });
  if (!fresh.length) throw nothingToSend(recipients.length);

  // The one-waiting-job index (migration 0007) is the real guard: a guest queued by a request
  // running at the same moment is rejected here, not by the read above.
  const campaignId = new Types.ObjectId();
  const inserted = await insertWaitingJobs(
    fresh.map((item) => ({
      weddingId: ctx.weddingId,
      campaignId,
      kind: input.kind,
      guestId: item.guestId,
      toEmail: item.email,
      status: 'PENDING',
      attempts: 0,
      idempotencyKey: `${campaignId.toHexString()}:${item.guestId.toHexString()}`,
      createdByUserId: ctx.userId,
    })),
  );
  if (!inserted) throw nothingToSend(recipients.length);
  const [campaign] = await campaigns(ctx, campaignId);
  return {
    campaign: campaign!,
    skipped: { noEmail, alreadyQueued: recipients.length - inserted },
  };
}

/** `POST /api/email-campaigns/:id/retry-failed` (API_DESIGN §16): failed jobs go back in the queue. */
export async function retryFailedCampaign(scope: Scope, id: string): Promise<Campaign> {
  const campaignId = toObjectId(id);
  const notFound = () => new AppError('NOT_FOUND', 'Campaign not found.');
  if (!campaignId) throw notFound();
  await connectDb();
  const failed = await EmailJob.find(
    { weddingId: scope.weddingId, campaignId, status: 'FAILED' },
    { _id: 1 },
  ).lean();
  for (const job of failed) {
    try {
      await EmailJob.updateOne(
        { _id: job._id, weddingId: scope.weddingId, status: 'FAILED' },
        {
          $set: { status: 'PENDING', attempts: 0 },
          $unset: { lastError: '', claimId: '', lockedUntil: '', purgeAt: '' },
        },
      );
    } catch (error) {
      // The guest is already waiting in a newer campaign (one-waiting-job index): leave this one.
      if (!isDuplicateKey(error)) throw error;
    }
  }
  const [campaign] = await campaigns(scope, campaignId);
  if (!campaign) throw notFound();
  return campaign;
}

/** Guest deletion (DATABASE_DESIGN §14.2): the guest's waiting emails are cancelled in its transaction. */
export async function cancelGuestEmailJobs(
  session: ClientSession,
  scope: Scope,
  guestId: Types.ObjectId,
): Promise<void> {
  const now = new Date();
  await EmailJob.updateMany(
    { weddingId: scope.weddingId, guestId, status: 'PENDING' },
    { $set: { status: 'CANCELLED', purgeAt: purgeAt(now) } },
    { session },
  );
}

// --- The worker (Vercel Cron) --------------------------------------------------------------------

type Prepared = { job: Awaited<ReturnType<typeof claimEmailJobs>>[number]; email: Email };

/**
 * `GET /api/internal/jobs/email` (API_DESIGN §27, SYSTEM_DESIGN §49–53): takes today's campaign
 * allowance, claims that many jobs across weddings, re-reads each guest (deleted, no email, no
 * events or already sent another way → CANCELLED), sends one provider batch, then marks each job.
 * Safe to run twice: a second run finds nothing claimable. Unused allowance is given back.
 */
export async function processEmailQueue(now = new Date()): Promise<EmailJobReport> {
  const started = Date.now();
  const allowance = await takeCampaign(BATCH_MAX, now);
  const claimId = randomBytes(12).toString('base64url');
  const jobs = await claimEmailJobs(allowance, claimId, now);
  await giveBack(allowance - jobs.length, now);

  const weddings = new Map<string, InvitationWedding | undefined>();
  const prepared: Prepared[] = [];
  let cancelled = 0;

  for (const job of jobs) {
    const scope = { weddingId: job.weddingId };
    const key = job.weddingId.toHexString();
    if (!weddings.has(key)) weddings.set(key, await findInvitationWedding(job.weddingId));
    const wedding = weddings.get(key);
    const guest =
      job.kind === 'GUEST_INVITATION' ? await guestForEmail(scope, job.guestId) : undefined;
    const email =
      wedding && guest && !guest.delivered
        ? await buildInvitation(scope, guest, wedding)
        : undefined;
    if (!email || typeof email === 'string') {
      await EmailJob.updateOne(
        { _id: job.jobId, weddingId: job.weddingId, claimId },
        {
          $set: { status: 'CANCELLED', purgeAt: purgeAt(now) },
          $unset: { claimId: '', lockedUntil: '' },
        },
      );
      cancelled += 1;
      continue;
    }
    prepared.push({ job, email });
  }
  await giveBack(cancelled, now);

  if (prepared.length) {
    const result = await sendEmailBatch(
      prepared.map((item) => item.email),
      'guest-invitation-campaign',
      claimId,
    );
    if (result.ok) {
      // The job and the guest's delivery change together, so a sent email is never left unrecorded.
      for (const [index, { job, email }] of prepared.entries()) {
        const scope = { weddingId: job.weddingId };
        await withTransaction(async (session) => {
          await EmailJob.updateOne(
            { _id: job.jobId, weddingId: job.weddingId, claimId },
            {
              $set: {
                status: 'SENT',
                sentAt: now,
                toEmail: email.to,
                purgeAt: purgeAt(now),
                ...(result.ids[index] ? { providerMessageId: result.ids[index] } : {}),
              },
              $unset: { claimId: '', lockedUntil: '', lastError: '' },
            },
            { session },
          );
          await recordEmailDelivery(scope, job.guestId, session);
        });
      }
    } else {
      await Promise.all(
        prepared.map(({ job }) => {
          const finalAttempt = job.attempts >= EMAIL_JOB_MAX_ATTEMPTS;
          return EmailJob.updateOne(
            { _id: job.jobId, weddingId: job.weddingId, claimId },
            {
              $set: {
                status: finalAttempt ? 'FAILED' : 'PENDING',
                lastError: result.error.slice(0, 500),
                ...(finalAttempt ? { purgeAt: purgeAt(now) } : {}),
              },
              $unset: { claimId: '', lockedUntil: '' },
            },
          );
        }),
      );
      await giveBack(prepared.length, now);
    }
  }

  return {
    processed: jobs.length,
    remaining: await countWaitingEmailJobs(),
    durationMs: Date.now() - started,
  };
}
