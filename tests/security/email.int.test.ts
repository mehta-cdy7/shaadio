import mongoose, { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Invitation emails (PRD §9.12, API_DESIGN §16 and §27, DATABASE_DESIGN §5.14, SYSTEM_DESIGN §49–53)
 * through the real route handlers on the in-memory replica set. Resend is replaced by a fake that
 * records what would have been sent. Own database.
 */
process.env.MONGODB_URI = process.env.MONGODB_URI!.replace('/shaadioo-test', '/shaadioo-email');

const sent = vi.hoisted(() => ({ single: [] as string[], batches: [] as string[][], fail: false }));
vi.mock('@/server/email/email', async (original) => ({
  ...(await original<typeof import('@/server/email/email')>()),
  sendEmail: vi.fn(async (email: { to: string }) => {
    if (sent.fail) return false;
    sent.single.push(email.to);
    return true;
  }),
  sendEmailBatch: vi.fn(async (emails: Array<{ to: string }>) => {
    if (sent.fail) return { ok: false, error: 'PROVIDER_DOWN' };
    sent.batches.push(emails.map((email) => email.to));
    return { ok: true, ids: emails.map((_, index) => `msg-${index}`) };
  }),
}));

const { POST: createEventRoute } = await import('@/app/api/events/route');
const { POST: createGuestRoute } = await import('@/app/api/guests/route');
const { DELETE: deleteGuestRoute, PATCH: patchGuestRoute } =
  await import('@/app/api/guests/[id]/route');
const { POST: markSentRoute } = await import('@/app/api/guests/[id]/mark-sent/route');
const { POST: sendOneRoute } = await import('@/app/api/guests/[id]/send-invitation-email/route');
const { GET: listCampaignsRoute, POST: createCampaignRoute } =
  await import('@/app/api/email-campaigns/route');
const { POST: retryRoute } = await import('@/app/api/email-campaigns/[id]/retry-failed/route');
const { GET: cronRoute } = await import('@/app/api/internal/jobs/email/route');
const { GET: listGuestsRoute } = await import('@/app/api/guests/route');
const { queueableGuestCount, queuedGuestIds } = await import('@/modules/invitations');
const { connectDb } = await import('@/server/db/connection');
const { emailsSentToday } = await import('@/server/email/quota');
const { adminWithWedding, getRequest, jsonRequest, ORIGIN, signUp } =
  await import('../factories/api');

const CRON_SECRET = 'cron-secret-for-integration-tests-0123456789';
const db = () => mongoose.connection.db!;
const params = (id: string) => ({ params: Promise.resolve({ id }) });

type Campaign = {
  id: string;
  counts: { pending: number; processing: number; sent: number; failed: number; cancelled: number };
  estimatedDaysRemaining: number;
};

async function event(cookie: string, weddingDate: string): Promise<string> {
  const res = await createEventRoute(
    jsonRequest(
      'POST',
      '/api/events',
      { name: 'Sangeet', type: 'SANGEET', date: weddingDate },
      cookie,
    ),
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function guest(cookie: string, body: Record<string, unknown>): Promise<string> {
  const res = await createGuestRoute(
    jsonRequest('POST', '/api/guests', { maxPeople: 2, invitedEventIds: [], ...body }, cookie),
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

/** An admin with one event and `n` emailable guests, plus one guest without an email. */
async function weddingWithGuests(n: number) {
  const admin = await adminWithWedding();
  const eventId = await event(admin.cookie, admin.weddingDate);
  const guestIds: string[] = [];
  for (let i = 0; i < n; i++) {
    guestIds.push(
      await guest(admin.cookie, {
        name: `Family ${i}`,
        email: `family${i}-${admin.weddingId}@example.com`,
        invitedEventIds: [eventId],
      }),
    );
  }
  await guest(admin.cookie, { name: 'No Email Family', invitedEventIds: [eventId] });
  return { ...admin, eventId, guestIds };
}

function queue(cookie: string, body: unknown = { kind: 'GUEST_INVITATION' }) {
  return createCampaignRoute(jsonRequest('POST', '/api/email-campaigns', body, cookie));
}

function runCron(secret: string | null = CRON_SECRET) {
  return cronRoute(
    new Request(`${ORIGIN}/api/internal/jobs/email`, {
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
    }),
  );
}

async function storedGuest(id: string) {
  return db()
    .collection('guests')
    .findOne({ _id: new Types.ObjectId(id) });
}

async function code(res: Response): Promise<string> {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

describe('invitation email security', () => {
  beforeAll(async () => {
    await connectDb();
  });

  beforeEach(async () => {
    process.env.CRON_SECRET = CRON_SECRET;
    process.env.EMAIL_DAILY_LIMIT = '100';
    process.env.EMAIL_TRANSACTIONAL_RESERVE = '20';
    sent.single.length = 0;
    sent.batches.length = 0;
    sent.fail = false;
    await Promise.all(
      [
        'users',
        'sessions',
        'rate_limits',
        'weddings',
        'wedding_memberships',
        'events',
        'guests',
        'email_jobs',
        'activity_logs',
      ].map((name) =>
        db()
          .dropCollection(name)
          .catch(() => undefined),
      ),
    );
    await Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes()));
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.EMAIL_DAILY_LIMIT;
    delete process.env.EMAIL_TRANSACTIONAL_RESERVE;
  });

  afterAll(async () => {
    await db().dropDatabase();
    await mongoose.disconnect();
  });

  it('requires a session and a wedding; the cron route requires the exact secret', async () => {
    expect((await listCampaignsRoute(getRequest('/api/email-campaigns'))).status).toBe(401);
    expect(await code(await queue(await signUp('Ravi')))).toBe('NO_WEDDING');

    expect((await runCron(null)).status).toBe(401);
    expect((await runCron('wrong-secret-wrong-secret-wrong-secret')).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await runCron(CRON_SECRET)).status).toBe(401);
    process.env.CRON_SECRET = CRON_SECRET;
    expect(await (await runCron()).json()).toMatchObject({ processed: 0, remaining: 0 });
  });

  it('queues only guests with an email, an event and no delivery; never twice', async () => {
    const { cookie, guestIds } = await weddingWithGuests(3);
    await guest(cookie, { name: 'No Events', email: 'noevents@example.com' });
    await markSentRoute(
      jsonRequest('POST', `/api/guests/${guestIds[2]}/mark-sent`, { via: 'WHATSAPP' }, cookie),
      params(guestIds[2]!),
    );

    const res = await queue(cookie);
    expect(res.status).toBe(202);
    const body = (await res.json()) as { campaign: Campaign; skipped: Record<string, number> };
    expect(body.campaign.counts.pending).toBe(2);
    expect(body.skipped).toEqual({ noEmail: 1, alreadyQueued: 0 });
    expect(sent.batches).toHaveLength(0);

    const again = await queue(cookie);
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({
      error: { details: { reason: 'NOTHING_TO_SEND', skipped: { alreadyQueued: 2 } } },
    });

    expect((await queue(cookie, { kind: 'RSVP_REMINDER' })).status).toBe(400);
    expect((await queue(cookie, { kind: 'GUEST_INVITATION', weddingId: 'x' })).status).toBe(400);
  });

  it('the worker sends once, marks jobs and guests, and a second run does nothing', async () => {
    const { cookie, guestIds } = await weddingWithGuests(3);
    await queue(cookie);

    const report = await (await runCron()).json();
    expect(report).toMatchObject({ processed: 3, remaining: 0 });
    expect(sent.batches).toHaveLength(1);
    expect(sent.batches[0]).toHaveLength(3);
    for (const id of guestIds) {
      expect((await storedGuest(id))!.delivery.sentVia).toBe('EMAIL');
    }
    const jobs = await db().collection('email_jobs').find().toArray();
    expect(jobs.every((job) => job.status === 'SENT' && job.purgeAt && !job.claimId)).toBe(true);

    expect(await (await runCron()).json()).toMatchObject({ processed: 0 });
    expect(sent.batches).toHaveLength(1);
  });

  it('two overlapping runs never send the same email twice', async () => {
    const { cookie } = await weddingWithGuests(6);
    await queue(cookie);
    const reports = await Promise.all([runCron(), runCron(), runCron()]);
    const processed = (await Promise.all(reports.map((res) => res.json()))).reduce(
      (sum: number, report: { processed: number }) => sum + report.processed,
      0,
    );
    expect(processed).toBe(6);
    const recipients = sent.batches.flat();
    expect(recipients).toHaveLength(6);
    expect(new Set(recipients).size).toBe(6);
  });

  it('cancels jobs for deleted guests, removed emails and guests sent another way meanwhile', async () => {
    const { cookie, guestIds } = await weddingWithGuests(3);
    await queue(cookie);

    expect(
      (
        await deleteGuestRoute(
          jsonRequest('DELETE', `/api/guests/${guestIds[0]}`, undefined, cookie),
          params(guestIds[0]!),
        )
      ).status,
    ).toBe(204);
    const removed = await db()
      .collection('email_jobs')
      .findOne({ guestId: new Types.ObjectId(guestIds[0]) });
    expect(removed!.status).toBe('CANCELLED');
    expect(
      (
        await patchGuestRoute(
          jsonRequest('PATCH', `/api/guests/${guestIds[1]}`, { email: null }, cookie),
          params(guestIds[1]!),
        )
      ).status,
    ).toBe(200);
    await markSentRoute(
      jsonRequest('POST', `/api/guests/${guestIds[2]}/mark-sent`, { via: 'WHATSAPP' }, cookie),
      params(guestIds[2]!),
    );

    expect(await (await runCron()).json()).toMatchObject({ processed: 2 });
    expect(sent.batches).toHaveLength(0);
    const statuses = (await db().collection('email_jobs').find().toArray()).map(
      (job) => job.status,
    );
    expect(statuses).toEqual(['CANCELLED', 'CANCELLED', 'CANCELLED']);
    expect((await storedGuest(guestIds[2]!))!.delivery.sentVia).toBe('WHATSAPP');
  });

  it('respects the daily limit and keeps the transactional reserve', async () => {
    process.env.EMAIL_DAILY_LIMIT = '25';
    const { cookie, guestIds } = await weddingWithGuests(8);
    await queue(cookie);

    expect(await (await runCron()).json()).toMatchObject({ processed: 5, remaining: 3 });
    expect(sent.batches.flat()).toHaveLength(5);
    const list = (await (
      await listCampaignsRoute(getRequest('/api/email-campaigns', cookie))
    ).json()) as {
      items: Campaign[];
    };
    expect(list.items[0]!.counts).toMatchObject({ sent: 5, pending: 3 });
    expect(list.items[0]!.estimatedDaysRemaining).toBe(1);

    // Campaign capacity is used up: a single send would dip into the reserve.
    const single = await sendOneRoute(
      jsonRequest('POST', `/api/guests/${guestIds[7]}/send-invitation-email`, {}, cookie),
      params(guestIds[7]!),
    );
    expect(single.status).toBe(503);
    const quotaError = (await single.json()) as {
      error: { code: string; details: { resetsAt: string } };
    };
    expect(quotaError.error.code).toBe('EMAIL_QUOTA_EXHAUSTED');
    const resetsAt = new Date(quotaError.error.details.resetsAt);
    expect(resetsAt.getUTCHours()).toBe(0);
    expect(resetsAt.getTime()).toBeGreaterThan(Date.now());
    expect(await emailsSentToday()).toBe(5);
  });

  it('provider failures retry up to 3 times, then FAILED, and retry-failed queues them again', async () => {
    const { cookie } = await weddingWithGuests(2);
    const campaign = ((await (await queue(cookie)).json()) as { campaign: Campaign }).campaign;
    sent.fail = true;

    // A failed batch puts the jobs straight back to PENDING until their third attempt.
    for (let run = 1; run <= 3; run++) await runCron();
    const failed = await db().collection('email_jobs').find().toArray();
    expect(failed.map((job) => [job.status, job.attempts])).toEqual([
      ['FAILED', 3],
      ['FAILED', 3],
    ]);
    // Failed sends are given back: the counter does not grow.
    expect(await emailsSentToday()).toBe(0);

    sent.fail = false;
    const retried = await retryRoute(
      jsonRequest('POST', `/api/email-campaigns/${campaign.id}/retry-failed`, {}, cookie),
      params(campaign.id),
    );
    expect(((await retried.json()) as Campaign).counts.pending).toBe(2);
    expect(await (await runCron()).json()).toMatchObject({ processed: 2 });
  });

  it('reclaims a job whose lease ran out', async () => {
    const { cookie } = await weddingWithGuests(1);
    await queue(cookie);
    await db()
      .collection('email_jobs')
      .updateMany(
        {},
        {
          $set: {
            status: 'PROCESSING',
            claimId: 'dead-run',
            lockedUntil: new Date(Date.now() - 1000),
            attempts: 1,
          },
        },
      );
    expect(await (await runCron()).json()).toMatchObject({ processed: 1 });
    expect((await db().collection('email_jobs').findOne({}))!.status).toBe('SENT');
  });

  it('single send: emails now, first one wins, and rejects missing email or events', async () => {
    const { cookie, guestIds } = await weddingWithGuests(2);
    const ok = await sendOneRoute(
      jsonRequest('POST', `/api/guests/${guestIds[0]}/send-invitation-email`, {}, cookie),
      params(guestIds[0]!),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ delivery: { sentVia: 'EMAIL' } });
    expect(sent.single).toHaveLength(1);

    await markSentRoute(
      jsonRequest('POST', `/api/guests/${guestIds[1]}/mark-sent`, { via: 'WHATSAPP' }, cookie),
      params(guestIds[1]!),
    );
    const again = await sendOneRoute(
      jsonRequest('POST', `/api/guests/${guestIds[1]}/send-invitation-email`, {}, cookie),
      params(guestIds[1]!),
    );
    expect(await again.json()).toMatchObject({ delivery: { sentVia: 'WHATSAPP' } });

    const noEmail = await guest(cookie, { name: 'Bansal Family' });
    const noEvents = await guest(cookie, { name: 'Verma Family', email: 'verma@example.com' });
    const send = (id: string) =>
      sendOneRoute(
        jsonRequest('POST', `/api/guests/${id}/send-invitation-email`, {}, cookie),
        params(id),
      );
    expect((await send(noEmail)).status).toBe(400);
    expect(await code(await send(noEvents))).toBe('NO_EVENTS');

    sent.fail = true;
    const third = await guest(cookie, {
      name: 'Kapoor Family',
      email: 'kapoor@example.com',
      invitedEventIds: [(await db().collection('events').findOne({}))!._id.toHexString()],
    });
    expect(await code(await send(third))).toBe('EMAIL_PROVIDER_ERROR');
    expect((await storedGuest(third))!.delivery).toBeUndefined();
  });

  it('queued guests are not offered again; sending one now cancels its queued email', async () => {
    const { cookie, weddingId, guestIds } = await weddingWithGuests(2);
    await guest(cookie, { name: 'No Events', email: 'noevents2@example.com' });
    const scope = { weddingId: new Types.ObjectId(weddingId) };
    expect(await queueableGuestCount(scope)).toBe(2);

    expect((await queue(cookie)).status).toBe(202);
    expect(await queueableGuestCount(scope)).toBe(0);
    expect((await queuedGuestIds(scope)).sort()).toEqual([...guestIds].sort());

    const ok = await sendOneRoute(
      jsonRequest('POST', `/api/guests/${guestIds[0]}/send-invitation-email`, {}, cookie),
      params(guestIds[0]!),
    );
    expect(ok.status).toBe(200);
    expect(await queuedGuestIds(scope)).toEqual([guestIds[1]]);
    const job = await db()
      .collection('email_jobs')
      .findOne({ guestId: new Types.ObjectId(guestIds[0]) });
    expect(job!.status).toBe('CANCELLED');

    const list = await listGuestsRoute(
      getRequest('/api/guests?rsvpStatus=PENDING&noEvents=false', cookie),
    );
    const names = ((await list.json()) as { items: Array<{ name: string }> }).items.map(
      (item) => item.name,
    );
    expect(names).not.toContain('No Events');
    expect(names).toHaveLength(3);
  });

  it('two campaigns queued at the same moment queue each guest once', async () => {
    const { cookie } = await weddingWithGuests(3);
    const results = await Promise.all([queue(cookie), queue(cookie), queue(cookie)]);
    expect(results.filter((res) => res.status === 202).length).toBeGreaterThanOrEqual(1);
    expect(await db().collection('email_jobs').countDocuments({ status: 'PENDING' })).toBe(3);
    await runCron();
    expect(sent.batches.flat()).toHaveLength(3);
  });

  it('retry-failed leaves a guest alone when a newer campaign already queued them', async () => {
    const { cookie } = await weddingWithGuests(1);
    const first = (await (await queue(cookie)).json()) as { campaign: Campaign };
    await db()
      .collection('email_jobs')
      .updateMany({}, { $set: { status: 'FAILED', attempts: 3 } });
    expect((await queue(cookie)).status).toBe(202);

    const retry = await retryRoute(
      jsonRequest('POST', `/api/email-campaigns/${first.campaign.id}/retry-failed`, {}, cookie),
      params(first.campaign.id),
    );
    expect(retry.status).toBe(202);
    expect(await db().collection('email_jobs').countDocuments({ status: 'PENDING' })).toBe(1);
    await runCron();
    expect(sent.batches.flat()).toHaveLength(1);
  });

  it('skipped.noEmail counts only the selected guests', async () => {
    const { cookie, guestIds } = await weddingWithGuests(2);
    const res = await queue(cookie, { kind: 'GUEST_INVITATION', guestIds: [guestIds[0]] });
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ skipped: { noEmail: 0, alreadyQueued: 0 } });
  });

  it('never lets one wedding see or touch another wedding’s emails', async () => {
    const a = await weddingWithGuests(2);
    const b = await adminWithWedding('Arjun');
    const campaign = ((await (await queue(a.cookie)).json()) as { campaign: Campaign }).campaign;

    const bList = (await (
      await listCampaignsRoute(getRequest('/api/email-campaigns', b.cookie))
    ).json()) as {
      items: Campaign[];
    };
    expect(bList.items).toHaveLength(0);
    expect(
      (
        await retryRoute(
          jsonRequest('POST', `/api/email-campaigns/${campaign.id}/retry-failed`, {}, b.cookie),
          params(campaign.id),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await sendOneRoute(
          jsonRequest('POST', `/api/guests/${a.guestIds[0]}/send-invitation-email`, {}, b.cookie),
          params(a.guestIds[0]!),
        )
      ).status,
    ).toBe(404);
    expect(sent.single).toHaveLength(0);
  });

  it('queueing is a mutation: Origin is checked', async () => {
    const { cookie } = await weddingWithGuests(1);
    const res = await createCampaignRoute(
      jsonRequest('POST', '/api/email-campaigns', { kind: 'GUEST_INVITATION' }, cookie, {
        origin: 'https://evil.example',
      }),
    );
    expect(res.status).toBe(403);
    expect(await db().collection('email_jobs').countDocuments()).toBe(0);
  });
});
