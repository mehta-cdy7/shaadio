import 'server-only';
import { hashToken } from '@/server/auth/tokens';
import { connectDb } from '@/server/db/connection';
import { emailQuota } from '@/server/env';
import { RateLimit } from '@/server/rate-limit/rate-limit';

/**
 * The daily email budget (SYSTEM_DESIGN §51, DATABASE_DESIGN §5.16 `email-day`): one counter for the
 * whole app, because the provider quota is per account. The day is the UTC date.
 *
 * - Transactional mail (member invitations, password resets) may use the whole daily limit.
 * - Campaign capacity (queued invitations, and single guest invitations, API_DESIGN §16) stops at
 *   the limit minus the reserve, so a campaign can never starve a password reset.
 *
 * Every take is a compare-and-set on the counter, so concurrent senders cannot overshoot.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const CAS_ATTEMPTS = 5;

function today(now: Date) {
  const start = Math.floor(now.getTime() / DAY_MS) * DAY_MS;
  return { _id: hashToken(`email-day:all:${start}`), expiresAt: new Date(start + DAY_MS) };
}

async function ensureCounter(now: Date) {
  const { _id, expiresAt } = today(now);
  try {
    await RateLimit.updateOne({ _id }, { $setOnInsert: { count: 0, expiresAt } }, { upsert: true });
  } catch (error) {
    // Two first senders of the day race on the upsert; the other one created it.
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  return _id;
}

/** When today's budget starts again: the next UTC midnight (API_DESIGN §4.3 `resetsAt`). */
export function quotaResetsAt(now = new Date()): Date {
  return today(now).expiresAt;
}

/** Emails counted today. */
export async function emailsSentToday(now = new Date()): Promise<number> {
  await connectDb();
  const doc = await RateLimit.findOne({ _id: today(now)._id }).lean();
  return doc?.count ?? 0;
}

/**
 * Takes up to `wanted` emails from today's budget below `ceiling`; returns how many were granted
 * (0 when the budget is used up).
 */
async function take(wanted: number, ceiling: number, now: Date): Promise<number> {
  if (wanted <= 0) return 0;
  await connectDb();
  const _id = await ensureCounter(now);
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    const current = (await RateLimit.findOne({ _id }).lean())?.count ?? 0;
    const granted = Math.min(wanted, ceiling - current);
    if (granted <= 0) return 0;
    const updated = await RateLimit.updateOne(
      { _id, count: current },
      { $inc: { count: granted } },
    );
    if (updated.modifiedCount === 1) return granted;
  }
  return 0;
}

/** One transactional email (member invitation, password reset): may use the reserve. */
export async function takeTransactional(now = new Date()): Promise<boolean> {
  return (await take(1, emailQuota().dailyLimit, now)) === 1;
}

/** Campaign capacity: never dips into the transactional reserve. */
export async function takeCampaign(wanted: number, now = new Date()): Promise<number> {
  const { dailyLimit, reserve } = emailQuota();
  return take(wanted, dailyLimit - reserve, now);
}

/** Gives back emails that were taken but not sent (cancelled jobs, provider failures). */
export async function giveBack(count: number, now = new Date()): Promise<void> {
  if (count <= 0) return;
  await connectDb();
  await RateLimit.updateOne(
    { _id: today(now)._id, count: { $gte: count } },
    { $inc: { count: -count } },
  );
}

/** Campaign emails per day at the current quota, for "about N days" estimates. */
export function campaignEmailsPerDay(): number {
  const { dailyLimit, reserve } = emailQuota();
  return Math.max(1, dailyLimit - reserve);
}
