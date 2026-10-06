import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as markSentRoute } from '@/app/api/guests/[id]/mark-sent/route';
import { POST as regenerateRoute } from '@/app/api/guests/[id]/regenerate-link/route';
import { POST as createGuestRoute } from '@/app/api/guests/route';
import { Guest } from '@/modules/guests/guest.model';
import { connectDb } from '@/server/db/connection';
import { adminWithWedding, jsonRequest, signUp } from '../factories/api';

/**
 * Mark as sent and WhatsApp share (PRD §9.14, API_DESIGN §16, DATABASE_DESIGN §5.8) through the
 * real route handlers on the in-memory replica set. Own database.
 */
process.env.MONGODB_URI = process.env.MONGODB_URI!.replace('/shaadioo-test', '/shaadioo-mark-sent');

const params = (id: string) => ({ params: Promise.resolve({ id }) });

type GuestBody = {
  id: string;
  delivery?: { sentAt: string; sentVia: string };
  version: number;
};

async function guest(cookie: string, name = 'Sharma Family'): Promise<GuestBody> {
  const res = await createGuestRoute(
    jsonRequest('POST', '/api/guests', { name, maxPeople: 4, invitedEventIds: [] }, cookie),
  );
  expect(res.status).toBe(201);
  return (await res.json()) as GuestBody;
}

function markSent(cookie: string | undefined, id: string, body: unknown, headers = {}) {
  return markSentRoute(
    jsonRequest('POST', `/api/guests/${id}/mark-sent`, body, cookie, headers),
    params(id),
  );
}

async function stored(id: string) {
  return mongoose.connection.db!.collection('guests').findOne({ _id: new Types.ObjectId(id) });
}

describe('mark-sent security', () => {
  beforeAll(async () => {
    await connectDb();
  });

  beforeEach(async () => {
    const db = mongoose.connection.db!;
    await Promise.all(
      [
        'users',
        'sessions',
        'rate_limits',
        'weddings',
        'wedding_memberships',
        'events',
        'guests',
        'activity_logs',
      ].map((name) => db.dropCollection(name).catch(() => undefined)),
    );
    await Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes()));
  });

  afterAll(async () => {
    await mongoose.connection.db!.dropDatabase();
    await mongoose.disconnect();
  });

  it('requires a session and a wedding', async () => {
    const { cookie } = await adminWithWedding();
    const created = await guest(cookie);
    expect((await markSent(undefined, created.id, { via: 'WHATSAPP' })).status).toBe(401);
    const res = await markSent(await signUp('Ravi'), created.id, { via: 'WHATSAPP' });
    expect((await res.json()).error.code).toBe('NO_WEDDING');
  });

  it('sets sentAt and sentVia, bumps the version and writes no activity entry', async () => {
    const { cookie } = await adminWithWedding();
    const created = await guest(cookie);
    const before = Date.now();
    const res = await markSent(cookie, created.id, { via: 'WHATSAPP' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as GuestBody;
    expect(body.delivery?.sentVia).toBe('WHATSAPP');
    expect(new Date(body.delivery!.sentAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(body.version).toBe(created.version + 1);
    expect(body).not.toHaveProperty('inviteUrl');
    const logs = await mongoose.connection.db!.collection('activity_logs').find().toArray();
    expect(logs.map((log) => log.action)).toEqual(['guest.created']);
  });

  it('first one wins: a repeat, by either channel, returns the guest unchanged', async () => {
    const { cookie } = await adminWithWedding();
    const created = await guest(cookie);
    const first = (await (
      await markSent(cookie, created.id, { via: 'MANUAL' })
    ).json()) as GuestBody;
    for (const via of ['MANUAL', 'WHATSAPP']) {
      const res = await markSent(cookie, created.id, { via });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(first);
    }
    expect((await stored(created.id))?.delivery.sentVia).toBe('MANUAL');
  });

  it('an emailed invitation stays emailed', async () => {
    const { cookie, weddingId } = await adminWithWedding();
    const created = await guest(cookie);
    const sentAt = new Date('2026-10-01T10:00:00Z');
    await Guest.updateOne(
      { _id: new Types.ObjectId(created.id), weddingId },
      { $set: { delivery: { sentAt, sentVia: 'EMAIL' } } },
    );
    const body = (await (
      await markSent(cookie, created.id, { via: 'WHATSAPP' })
    ).json()) as GuestBody;
    expect(body.delivery).toEqual({ sentAt: sentAt.toISOString(), sentVia: 'EMAIL' });
  });

  it('after regenerating the link it can be marked sent again', async () => {
    const { cookie } = await adminWithWedding();
    const created = await guest(cookie);
    await markSent(cookie, created.id, { via: 'MANUAL' });
    await regenerateRoute(
      jsonRequest('POST', `/api/guests/${created.id}/regenerate-link`, undefined, cookie),
      params(created.id),
    );
    const body = (await (
      await markSent(cookie, created.id, { via: 'WHATSAPP' })
    ).json()) as GuestBody;
    expect(body.delivery?.sentVia).toBe('WHATSAPP');
  });

  it('rejects EMAIL, unknown channels, extra fields and a missing body', async () => {
    const { cookie } = await adminWithWedding();
    const created = await guest(cookie);
    for (const body of [
      { via: 'EMAIL' },
      { via: 'SMS' },
      { via: 'WHATSAPP', sentAt: '2026-01-01T00:00:00Z' },
      {},
      undefined,
    ]) {
      const res = await markSent(cookie, created.id, body);
      expect(res.status).toBe(400);
    }
    expect(await stored(created.id)).not.toHaveProperty('delivery');
  });

  it("another wedding's guest, or a malformed id, is 404 and stays unchanged", async () => {
    const priya = await adminWithWedding('Priya');
    const ravi = await adminWithWedding('Ravi');
    const created = await guest(priya.cookie);
    const res = await markSent(ravi.cookie, created.id, { via: 'WHATSAPP' });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
    expect(await stored(created.id)).not.toHaveProperty('delivery');
    expect((await markSent(ravi.cookie, 'not-an-id', { via: 'WHATSAPP' })).status).toBe(404);
    expect(
      (await markSent(ravi.cookie, new Types.ObjectId().toHexString(), { via: 'MANUAL' })).status,
    ).toBe(404);
  });

  it('is refused from another origin (CSRF, API §2.2)', async () => {
    const { cookie } = await adminWithWedding();
    const created = await guest(cookie);
    const res = await markSent(
      cookie,
      created.id,
      { via: 'WHATSAPP' },
      {
        origin: 'https://evil.example',
      },
    );
    expect(res.status).toBe(403);
    expect(await stored(created.id)).not.toHaveProperty('delivery');
  });
});
