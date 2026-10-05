import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DELETE as deleteEventRoute,
  GET as getEventRoute,
  PATCH as patchEventRoute,
} from '@/app/api/events/[id]/route';
import { GET as previewRoute } from '@/app/api/events/[id]/delete-preview/route';
import { GET as listEventsRoute, POST as createEventRoute } from '@/app/api/events/route';
import { GET as getWeddingRoute } from '@/app/api/wedding/route';
import { Activity, AppendOnlyError } from '@/modules/activity/activity.model';
import { Event } from '@/modules/events/event.model';
import { connectDb } from '@/server/db/connection';
import { UnscopedQueryError } from '@/server/db/tenant-guard';
import { addDays, addYears } from '@/lib/dates';
import { adminWithWedding, getRequest, jsonRequest, signUp } from '../factories/api';

/**
 * Events (API_DESIGN §3, §13, §30; DATABASE_DESIGN §5.7, §5.15, §6.5, §14.1) through the real
 * route handlers on the in-memory replica set. Own database, so other files cannot interfere.
 */
process.env.MONGODB_URI = process.env.MONGODB_URI!.replace('/shaadioo-test', '/shaadioo-events');

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const haldi = {
  name: 'Haldi',
  type: 'HALDI',
  date: '2027-02-12',
  startTime: '10:00',
  endTime: '13:00',
  venue: {
    name: 'Courtyard, Forest Resort',
    address: 'Rajpur Road',
    mapUrl: 'https://maps.google.com/?q=Forest+Resort',
  },
  dressCode: 'Yellow',
};

async function create(cookie: string, body: unknown = haldi) {
  return createEventRoute(jsonRequest('POST', '/api/events', body, cookie));
}

async function createdId(cookie: string, body: unknown = haldi): Promise<string> {
  const res = await create(cookie, body);
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

describe('events security', () => {
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
    expect((await listEventsRoute(getRequest('/api/events'))).status).toBe(401);
    const res = await listEventsRoute(getRequest('/api/events', await signUp()));
    expect((await res.json()).error.code).toBe('NO_WEDDING');
  });

  it('creates an event and lists events by date, then time (no time first)', async () => {
    const { cookie } = await adminWithWedding();
    const res = await create(cookie);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      name: 'Haldi',
      type: 'HALDI',
      venue: haldi.venue,
      headcount: { households: 0, people: 0 },
    });
    await createdId(cookie, {
      name: 'Sangeet',
      type: 'SANGEET',
      date: '2027-02-12',
      startTime: '19:30',
    });
    await createdId(cookie, { name: 'Puja', type: 'CUSTOM', date: '2027-02-12' });
    await createdId(cookie, { name: 'Roka', type: 'ROKA', date: '2026-12-12' });

    const { items } = await (await listEventsRoute(getRequest('/api/events', cookie))).json();
    expect(items.map((e: { name: string }) => e.name)).toEqual([
      'Roka',
      'Puja',
      'Haldi',
      'Sangeet',
    ]);
  });

  it("another wedding's event is 404 for read, edit, preview and delete, and stays unchanged", async () => {
    const asha = await adminWithWedding('Asha');
    const ravi = await adminWithWedding('Ravi');
    const id = await createdId(asha.cookie);
    const before = await mongoose.connection.db!.collection('events').findOne({});

    const responses = [
      await getEventRoute(getRequest(`/api/events/${id}`, ravi.cookie), params(id)),
      await patchEventRoute(
        jsonRequest('PATCH', `/api/events/${id}`, { name: 'Hacked' }, ravi.cookie),
        params(id),
      ),
      await previewRoute(getRequest(`/api/events/${id}/delete-preview`, ravi.cookie), params(id)),
      await deleteEventRoute(
        jsonRequest('DELETE', `/api/events/${id}`, undefined, ravi.cookie),
        params(id),
      ),
    ];
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe('NOT_FOUND');
    }
    expect(await mongoose.connection.db!.collection('events').findOne({})).toEqual(before);
    const { items } = await (await listEventsRoute(getRequest('/api/events', ravi.cookie))).json();
    expect(items).toEqual([]);
  });

  it('a malformed id is the same 404', async () => {
    const { cookie } = await adminWithWedding();
    for (const id of ['nope', '123', `${new Types.ObjectId().toHexString()}x`]) {
      const res = await getEventRoute(getRequest(`/api/events/${id}`, cookie), params(id));
      expect(res.status).toBe(404);
    }
  });

  it('rejects server-owned fields, unknown types and non-http map links', async () => {
    const { cookie } = await adminWithWedding();
    for (const extra of [
      { weddingId: new Types.ObjectId().toHexString() },
      { createdByUserId: 'x' },
      { headcount: { people: 500 } },
      { coverImageKey: 'weddings/x' },
      { type: 'BACHELOR' },
      { venue: { mapUrl: 'javascript:alert(1)' } },
      { venue: { mapUrl: 'data:text/html,hi' } },
      { startTime: '25:00' },
      { date: '2027-02-30' },
    ]) {
      expect((await create(cookie, { ...haldi, ...extra })).status).toBe(400);
    }
    expect(await mongoose.connection.db!.collection('events').countDocuments()).toBe(0);
  });

  it('stops at 30 events with LIMIT_REACHED', async () => {
    const { cookie, weddingId } = await adminWithWedding();
    const now = new Date();
    await mongoose.connection.db!.collection('events').insertMany(
      Array.from({ length: 30 }, (_, i) => ({
        weddingId: new Types.ObjectId(weddingId),
        name: `Event ${i}`,
        type: 'CUSTOM',
        date: '2027-02-01',
        createdByUserId: new Types.ObjectId(),
        createdAt: now,
        updatedAt: now,
      })),
    );
    const res = await create(cookie);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatchObject({
      code: 'LIMIT_REACHED',
      details: { limit: 30 },
    });
  });

  it('PATCH: omitted unchanged, null clears, a blank venue is removed', async () => {
    const { cookie } = await adminWithWedding();
    const id = await createdId(cookie);
    const patch = (body: unknown) =>
      patchEventRoute(jsonRequest('PATCH', `/api/events/${id}`, body, cookie), params(id));

    let body = await (await patch({ dressCode: null, endTime: null })).json();
    expect(body).not.toHaveProperty('dressCode');
    expect(body).not.toHaveProperty('endTime');
    expect(body.startTime).toBe('10:00');

    body = await (await patch({ venue: { name: '', address: '', mapUrl: '' } })).json();
    expect(body).not.toHaveProperty('venue');
    const stored = await mongoose.connection.db!.collection('events').findOne({});
    expect(stored).not.toHaveProperty('venue');
    expect(stored).not.toHaveProperty('dressCode');
  });

  it('delete removes the event and logs event.deleted in the same transaction', async () => {
    const { cookie } = await adminWithWedding('Priya Sharma');
    const id = await createdId(cookie);

    const preview = await previewRoute(
      getRequest(`/api/events/${id}/delete-preview`, cookie),
      params(id),
    );
    expect(await preview.json()).toEqual({
      invitedCount: 0,
      onlyThisEvent: { count: 0, names: [] },
      tasks: 0,
      expenses: 0,
      photos: 0,
    });

    const res = await deleteEventRoute(
      jsonRequest('DELETE', `/api/events/${id}`, undefined, cookie),
      params(id),
    );
    expect(res.status).toBe(204);
    const db = mongoose.connection.db!;
    expect(await db.collection('events').countDocuments()).toBe(0);
    const log = await db.collection('activity_logs').findOne({});
    expect(log).toMatchObject({
      action: 'event.deleted',
      actor: { name: 'Priya Sharma' },
      target: { type: 'event', label: 'Haldi' },
      meta: { affectedGuests: 0, leftWithNoEvents: 0 },
    });
    expect(String(log!.target.id)).toBe(id);

    const again = await deleteEventRoute(
      jsonRequest('DELETE', `/api/events/${id}`, undefined, cookie),
      params(id),
    );
    expect(again.status).toBe(404);
  });

  it("the wedding's isEmpty follows its events (API §11, PRD §9.2)", async () => {
    const { cookie } = await adminWithWedding();
    const isEmpty = async () =>
      (
        (await (await getWeddingRoute(getRequest('/api/wedding', cookie))).json()) as {
          isEmpty: boolean;
        }
      ).isEmpty;

    expect(await isEmpty()).toBe(true);
    const id = await createdId(cookie);
    expect(await isEmpty()).toBe(false);
    await deleteEventRoute(
      jsonRequest('DELETE', `/api/events/${id}`, undefined, cookie),
      params(id),
    );
    expect(await isEmpty()).toBe(true);
  });

  it("another wedding's events do not make this wedding non-empty", async () => {
    const asha = await adminWithWedding('Asha');
    const ravi = await adminWithWedding('Ravi');
    await createdId(asha.cookie);
    const res = await getWeddingRoute(getRequest('/api/wedding', ravi.cookie));
    expect((await res.json()).isEmpty).toBe(true);
  });

  it('mutations from another origin are refused (CSRF, API §2.2)', async () => {
    const { cookie } = await adminWithWedding();
    const id = await createdId(cookie);
    const evil = { origin: 'https://evil.example' };
    expect(
      (await createEventRoute(jsonRequest('POST', '/api/events', haldi, cookie, evil))).status,
    ).toBe(403);
    expect(
      (
        await deleteEventRoute(
          jsonRequest('DELETE', `/api/events/${id}`, undefined, cookie, evil),
          params(id),
        )
      ).status,
    ).toBe(403);
    expect(await mongoose.connection.db!.collection('events').countDocuments()).toBe(1);
  });

  it('events and activity logs are tenant-guarded; activity logs are append-only (DB §6.5)', async () => {
    await expect(Event.find({ name: 'Haldi' }).lean()).rejects.toBeInstanceOf(UnscopedQueryError);
    await expect(Event.aggregate([{ $match: { type: 'HALDI' } }])).rejects.toBeInstanceOf(
      UnscopedQueryError,
    );
    await expect(Activity.find({}).lean()).rejects.toBeInstanceOf(UnscopedQueryError);
    const weddingId = new Types.ObjectId();
    await expect(
      Activity.updateOne({ weddingId }, { $set: { action: 'event.deleted' } }),
    ).rejects.toBeInstanceOf(AppendOnlyError);
    await expect(Activity.deleteMany({ weddingId })).rejects.toBeInstanceOf(AppendOnlyError);
  });

  describe('date and time rules (PRD §9.5)', () => {
    it('an end time needs a start time and must differ from it', async () => {
      const { cookie } = await adminWithWedding();
      for (const times of [{ endTime: '23:00' }, { startTime: '18:00', endTime: '18:00' }]) {
        const res = await create(cookie, {
          name: 'Cocktail',
          type: 'COCKTAIL',
          date: '2027-02-12',
          ...times,
        });
        expect(res.status).toBe(400);
        expect((await res.json()).error.details.fields).toHaveProperty('endTime');
      }
      // Earlier end = next day: allowed.
      const overnight = await create(cookie, {
        name: 'Sangeet',
        type: 'SANGEET',
        date: '2027-02-13',
        startTime: '20:00',
        endTime: '01:00',
      });
      expect(overnight.status).toBe(201);
    });

    it('PATCH checks the stored times: clearing the start alone is refused, both is fine', async () => {
      const { cookie } = await adminWithWedding();
      const id = await createdId(cookie);
      const patch = (body: unknown) =>
        patchEventRoute(jsonRequest('PATCH', `/api/events/${id}`, body, cookie), params(id));
      expect((await patch({ startTime: null })).status).toBe(400);
      expect((await patch({ endTime: '10:00' })).status).toBe(400);
      const res = await patch({ startTime: null, endTime: null });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).not.toHaveProperty('startTime');
      expect(body).not.toHaveProperty('endTime');
    });

    it('a date may be at most a year after the wedding, and any earlier date', async () => {
      const { cookie, weddingDate } = await adminWithWedding();
      const latest = addYears(weddingDate, 1);
      expect((await create(cookie, { ...haldi, date: latest })).status).toBe(201);
      expect((await create(cookie, { ...haldi, date: '2020-01-01' })).status).toBe(201);
      const tooLate = await create(cookie, { ...haldi, date: addDays(latest, 1) });
      expect(tooLate.status).toBe(400);
      expect((await tooLate.json()).error.details.fields).toHaveProperty('date');
      expect((await create(cookie, { ...haldi, date: '2199-01-01' })).status).toBe(400);
    });

    it('the range applies only when the date changes, so other edits still work', async () => {
      const { cookie, weddingDate } = await adminWithWedding();
      const id = await createdId(cookie, { ...haldi, date: addYears(weddingDate, 1) });
      // The wedding moves a month earlier: the event is now past the range, but stays editable.
      await mongoose.connection
        .db!.collection('weddings')
        .updateMany({}, { $set: { weddingDate: addDays(weddingDate, -30) } });
      const patch = (body: unknown) =>
        patchEventRoute(jsonRequest('PATCH', `/api/events/${id}`, body, cookie), params(id));
      expect((await patch({ name: 'Post-wedding puja' })).status).toBe(200);
      expect((await patch({ date: addYears(weddingDate, 1) })).status).toBe(200);
      expect((await patch({ date: addDays(addYears(weddingDate, 1), 1) })).status).toBe(400);
    });
  });
});
