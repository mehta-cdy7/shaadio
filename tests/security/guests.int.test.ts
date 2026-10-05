import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DELETE as deleteEventRoute, GET as getEventRoute } from '@/app/api/events/[id]/route';
import { GET as previewRoute } from '@/app/api/events/[id]/delete-preview/route';
import { POST as createEventRoute } from '@/app/api/events/route';
import { POST as regenerateRoute } from '@/app/api/guests/[id]/regenerate-link/route';
import {
  DELETE as deleteGuestRoute,
  GET as getGuestRoute,
  PATCH as patchGuestRoute,
} from '@/app/api/guests/[id]/route';
import { PATCH as rsvpRoute } from '@/app/api/guests/[id]/rsvp/route';
import { GET as listGuestsRoute, POST as createGuestRoute } from '@/app/api/guests/route';
import { GET as getWeddingRoute } from '@/app/api/wedding/route';
import { getDashboard } from '@/modules/dashboard';
import { Guest } from '@/modules/guests/guest.model';
import { connectDb } from '@/server/db/connection';
import { UnscopedQueryError } from '@/server/db/tenant-guard';
import { adminWithWedding, getRequest, jsonRequest, ORIGIN, signUp } from '../factories/api';

/**
 * Guests (API_DESIGN §3, §5, §6, §14, §30; DATABASE_DESIGN §5.8, §6.4, §6.5, §10, §13, §14.1–2)
 * through the real route handlers on the in-memory replica set. Own database.
 */
process.env.MONGODB_URI = process.env.MONGODB_URI!.replace('/shaadioo-test', '/shaadioo-guests');

const params = (id: string) => ({ params: Promise.resolve({ id }) });

type GuestBody = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  side?: string;
  maxPeople: number;
  invitedEventIds: string[];
  rsvp: { status: string; attendingCount: number; respondedVia?: string };
  delivery?: unknown;
  linkOpenedAt?: string;
  version: number;
  inviteUrl?: string;
};

async function eventId(cookie: string, name = 'Haldi', date = '2027-02-12'): Promise<string> {
  const res = await createEventRoute(
    jsonRequest('POST', '/api/events', { name, type: 'CUSTOM', date }, cookie),
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function createGuest(cookie: string, body: Record<string, unknown>) {
  return createGuestRoute(
    jsonRequest('POST', '/api/guests', { maxPeople: 4, invitedEventIds: [], ...body }, cookie),
  );
}

async function guest(cookie: string, body: Record<string, unknown>): Promise<GuestBody> {
  const res = await createGuest(cookie, body);
  expect(res.status).toBe(201);
  return (await res.json()) as GuestBody;
}

async function list(cookie: string, query = '') {
  const res = await listGuestsRoute(getRequest(`/api/guests${query}`, cookie));
  return { status: res.status, body: await res.json() };
}

async function rsvp(cookie: string, id: string, body: Record<string, unknown>) {
  return rsvpRoute(jsonRequest('PATCH', `/api/guests/${id}/rsvp`, body, cookie), params(id));
}

async function patch(cookie: string, id: string, body: Record<string, unknown>) {
  return patchGuestRoute(jsonRequest('PATCH', `/api/guests/${id}`, body, cookie), params(id));
}

describe('guests security', () => {
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
    expect((await listGuestsRoute(getRequest('/api/guests'))).status).toBe(401);
    const res = await listGuestsRoute(getRequest('/api/guests', await signUp()));
    expect((await res.json()).error.code).toBe('NO_WEDDING');
  });

  it('creates a guest with a normalised phone, lowercased email and a 128-bit link', async () => {
    const { cookie } = await adminWithWedding('Priya Sharma');
    const haldi = await eventId(cookie);
    const created = await guest(cookie, {
      name: '  Sharma Family ',
      side: 'BRIDE',
      phone: '98112 34567',
      email: ' Sharma.Family@Example.com ',
      invitedEventIds: [haldi, haldi],
      notes: '',
    });
    expect(created).toMatchObject({
      name: 'Sharma Family',
      side: 'BRIDE',
      phone: '+919811234567',
      email: 'sharma.family@example.com',
      maxPeople: 4,
      invitedEventIds: [haldi],
      rsvp: { status: 'PENDING', attendingCount: 0 },
      version: 0,
    });
    expect(created).not.toHaveProperty('notes');
    const token = created.inviteUrl!.replace(`${ORIGIN}/invite/`, '');
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);

    const log = await mongoose.connection.db!.collection('activity_logs').findOne({});
    expect(log).toMatchObject({ action: 'guest.created', target: { label: 'Sharma Family' } });
  });

  it('the token is select:false and lists never include the link', async () => {
    const { cookie, weddingId } = await adminWithWedding();
    const created = await guest(cookie, { name: 'Verma' });
    const stored = await Guest.findOne({ weddingId }).lean();
    expect(stored!.inviteLink).not.toHaveProperty('token');
    const { body } = await list(cookie);
    expect(body.items[0]).not.toHaveProperty('inviteUrl');
    expect(JSON.stringify(body)).not.toContain(created.inviteUrl!.split('/invite/')[1]);
  });

  it('rejects server-owned fields, bad phones and out-of-range maxPeople', async () => {
    const { cookie, weddingId } = await adminWithWedding();
    for (const body of [
      { name: 'A', weddingId },
      { name: 'A', version: 3 },
      { name: 'A', rsvp: { status: 'ATTENDING' } },
      { name: 'A', phone: '12345' },
      { name: 'A', maxPeople: 0 },
      { name: 'A', maxPeople: 21 },
      { name: 'A', email: 'not-an-email' },
      { name: '' },
    ]) {
      const res = await createGuest(cookie, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("a guest cannot be invited to another wedding's event (DB §6.4)", async () => {
    const asha = await adminWithWedding('Asha');
    const ravi = await adminWithWedding('Ravi');
    const ashaEvent = await eventId(asha.cookie);
    const ravisGuest = await guest(ravi.cookie, { name: 'Kapoor' });

    const created = await createGuest(ravi.cookie, { name: 'X', invitedEventIds: [ashaEvent] });
    expect(created.status).toBe(404);
    expect((await created.json()).error.details).toEqual({ field: 'invitedEventIds' });

    const patched = await patch(ravi.cookie, ravisGuest.id, { invitedEventIds: [ashaEvent] });
    expect(patched.status).toBe(404);
    const stored = await Guest.findOne({ weddingId: ravi.weddingId }).lean();
    expect(stored!.invitedEvents).toEqual([]);
  });

  it("another wedding's guest is 404 everywhere and stays unchanged", async () => {
    const asha = await adminWithWedding('Asha');
    const ravi = await adminWithWedding('Ravi');
    const target = await guest(asha.cookie, { name: 'Sharma' });
    const id = target.id;
    const before = await mongoose.connection.db!.collection('guests').findOne({});

    const responses = [
      await getGuestRoute(getRequest(`/api/guests/${id}`, ravi.cookie), params(id)),
      await patch(ravi.cookie, id, { name: 'Hacked' }),
      await rsvp(ravi.cookie, id, { status: 'NOT_ATTENDING', expectedVersion: 0 }),
      await regenerateRoute(
        jsonRequest('POST', `/api/guests/${id}/regenerate-link`, undefined, ravi.cookie),
        params(id),
      ),
      await deleteGuestRoute(
        jsonRequest('DELETE', `/api/guests/${id}`, undefined, ravi.cookie),
        params(id),
      ),
    ];
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe('NOT_FOUND');
    }
    expect(await mongoose.connection.db!.collection('guests').findOne({})).toEqual(before);
    expect((await list(ravi.cookie)).body.items).toEqual([]);
  });

  it('a malformed id is the same 404', async () => {
    const { cookie } = await adminWithWedding();
    const res = await getGuestRoute(getRequest('/api/guests/nope', cookie), params('nope'));
    expect(res.status).toBe(404);
  });

  it('lists by name ignoring case, page by page, without skipping or repeating', async () => {
    const { cookie } = await adminWithWedding();
    for (const name of ['zaveri', 'Agarwal', 'bansal', 'Chopra', 'agarwal', 'Dutta', 'Bansal']) {
      await guest(cookie, { name });
    }
    const names: string[] = [];
    let cursor: string | undefined;
    do {
      const { body } = await list(cookie, `?limit=3${cursor ? `&cursor=${cursor}` : ''}`);
      names.push(...body.items.map((item: GuestBody) => item.name));
      cursor = body.nextCursor;
    } while (cursor);
    expect(names.map((name) => name.toLowerCase())).toEqual([
      'agarwal',
      'agarwal',
      'bansal',
      'bansal',
      'chopra',
      'dutta',
      'zaveri',
    ]);
  });

  it('a cursor from another filter, or a forged one, is rejected', async () => {
    const { cookie } = await adminWithWedding();
    for (const name of ['A', 'B', 'C']) await guest(cookie, { name, side: 'BRIDE' });
    const { body } = await list(cookie, '?limit=1');
    expect((await list(cookie, `?limit=1&side=BRIDE&cursor=${body.nextCursor}`)).status).toBe(400);
    expect((await list(cookie, '?cursor=garbage')).status).toBe(400);
    expect((await list(cookie, `?limit=1&cursor=${body.nextCursor}`)).status).toBe(200);
  });

  it('filters by search, side, event, RSVP, sent and no events', async () => {
    const { cookie } = await adminWithWedding();
    const haldi = await eventId(cookie);
    const sharma = await guest(cookie, {
      name: 'Sharma Family',
      side: 'BRIDE',
      phone: '9811234567',
      invitedEventIds: [haldi],
    });
    await guest(cookie, { name: 'Verma', side: 'GROOM', invitedEventIds: [haldi] });
    await guest(cookie, { name: 'Shah', side: 'BOTH' });
    expect(
      (
        await rsvp(cookie, sharma.id, {
          status: 'ATTENDING',
          attendingCount: 3,
          expectedVersion: 0,
        })
      ).status,
    ).toBe(200);

    const names = async (query: string) =>
      (await list(cookie, query)).body.items.map((item: GuestBody) => item.name);
    expect(await names('?search=sh')).toEqual(['Shah', 'Sharma Family']);
    expect(await names('?search=family')).toEqual([]); // prefix only
    expect(await names('?search=12345')).toEqual(['Sharma Family']); // phone digits
    expect(await names('?search=.*')).toEqual([]); // regex characters are literal
    expect(await names('?side=BRIDE&side=GROOM')).toEqual(['Sharma Family', 'Verma']);
    expect(await names(`?eventId=${haldi}`)).toEqual(['Sharma Family', 'Verma']);
    expect(await names('?rsvpStatus=ATTENDING')).toEqual(['Sharma Family']);
    expect(await names('?rsvpStatus=PENDING&side=GROOM')).toEqual(['Verma']);
    expect(await names('?noEvents=true')).toEqual(['Shah']);
    expect(await names('?sent=false')).toHaveLength(3);
    expect(await names('?opened=true')).toEqual([]);
    expect((await list(cookie, '?side=AUNTY')).status).toBe(400);
    expect((await list(cookie, '?weddingId=x')).status).toBe(400);
  });

  it('PATCH: omitted unchanged, null clears, logged with the changes', async () => {
    const { cookie, weddingId } = await adminWithWedding();
    const created = await guest(cookie, {
      name: 'Sharma',
      side: 'BRIDE',
      phone: '9811234567',
      notes: 'Ground floor',
    });
    const res = await patch(cookie, created.id, { side: null, notes: null, maxPeople: 6 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as GuestBody;
    expect(body).toMatchObject({
      name: 'Sharma',
      phone: '+919811234567',
      maxPeople: 6,
      version: 1,
    });
    expect(body).not.toHaveProperty('side');
    expect(body).not.toHaveProperty('notes');
    const stored = await Guest.findOne({ weddingId }).lean();
    expect(stored).not.toHaveProperty('side');

    const log = await mongoose.connection
      .db!.collection('activity_logs')
      .findOne({ action: 'guest.updated' });
    expect(log!.changes).toEqual([
      { field: 'side', before: 'BRIDE', after: null },
      { field: 'maxPeople', before: 4, after: 6 },
      { field: 'notes', before: 'Ground floor', after: null },
    ]);
  });

  it('maxPeople cannot drop below the confirmed count (BELOW_CONFIRMED)', async () => {
    const { cookie } = await adminWithWedding();
    const created = await guest(cookie, { name: 'Sharma' });
    await rsvp(cookie, created.id, { status: 'ATTENDING', attendingCount: 3, expectedVersion: 0 });
    const res = await patch(cookie, created.id, { maxPeople: 2 });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatchObject({
      code: 'BELOW_CONFIRMED',
      details: { attendingCount: 3 },
    });
    expect((await patch(cookie, created.id, { maxPeople: 3 })).status).toBe(200);
  });

  it('member RSVP: version-checked, capacity-checked, PENDING resets the answer', async () => {
    const { cookie } = await adminWithWedding();
    const created = await guest(cookie, { name: 'Sharma' });

    const over = await rsvp(cookie, created.id, {
      status: 'ATTENDING',
      attendingCount: 5,
      expectedVersion: 0,
    });
    expect((await over.json()).error).toMatchObject({
      code: 'CAPACITY_EXCEEDED',
      details: { maxPeople: 4 },
    });

    const ok = await rsvp(cookie, created.id, {
      status: 'ATTENDING',
      attendingCount: 3,
      expectedVersion: 0,
    });
    expect(await ok.json()).toMatchObject({
      rsvp: { status: 'ATTENDING', attendingCount: 3, respondedVia: 'MEMBER' },
      version: 1,
    });

    const stale = await rsvp(cookie, created.id, { status: 'NOT_ATTENDING', expectedVersion: 0 });
    expect(stale.status).toBe(409);
    expect((await stale.json()).error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { current: { rsvp: { status: 'ATTENDING', attendingCount: 3 }, version: 1 } },
    });

    const reset = await rsvp(cookie, created.id, { status: 'PENDING', expectedVersion: 1 });
    const body = (await reset.json()) as GuestBody;
    expect(body.rsvp).toEqual({ status: 'PENDING', attendingCount: 0 });

    const missingCount = await rsvp(cookie, created.id, {
      status: 'ATTENDING',
      expectedVersion: 2,
    });
    expect(missingCount.status).toBe(400);
  });

  it('regenerating the link replaces it and clears sent and opened', async () => {
    const { cookie, weddingId } = await adminWithWedding();
    const created = await guest(cookie, { name: 'Sharma' });
    await Guest.updateOne(
      { _id: new Types.ObjectId(created.id), weddingId },
      {
        $set: {
          delivery: { sentAt: new Date(), sentVia: 'WHATSAPP' },
          'inviteLink.firstOpenedAt': new Date(),
        },
      },
    );
    const res = await regenerateRoute(
      jsonRequest('POST', `/api/guests/${created.id}/regenerate-link`, undefined, cookie),
      params(created.id),
    );
    const body = (await res.json()) as GuestBody;
    expect(body.inviteUrl).not.toBe(created.inviteUrl);
    expect(body).not.toHaveProperty('delivery');
    expect(body).not.toHaveProperty('linkOpenedAt');
    const log = await mongoose.connection
      .db!.collection('activity_logs')
      .findOne({ action: 'guest.link_regenerated' });
    expect(log).toBeTruthy();
  });

  it('delete removes the guest and logs guest.deleted; a second delete is 404', async () => {
    const { cookie } = await adminWithWedding();
    const created = await guest(cookie, { name: 'Sharma' });
    const del = () =>
      deleteGuestRoute(
        jsonRequest('DELETE', `/api/guests/${created.id}`, undefined, cookie),
        params(created.id),
      );
    expect((await del()).status).toBe(204);
    expect(await mongoose.connection.db!.collection('guests').countDocuments()).toBe(0);
    const log = await mongoose.connection
      .db!.collection('activity_logs')
      .findOne({ action: 'guest.deleted' });
    expect(log).toMatchObject({ target: { label: 'Sharma' } });
    expect((await del()).status).toBe(404);
  });

  it('mutations from another origin are refused (CSRF, API §2.2)', async () => {
    const { cookie } = await adminWithWedding();
    const created = await guest(cookie, { name: 'Sharma' });
    const evil = { origin: 'https://evil.example' };
    const responses = [
      await createGuestRoute(jsonRequest('POST', '/api/guests', { name: 'X' }, cookie, evil)),
      await patchGuestRoute(
        jsonRequest('PATCH', `/api/guests/${created.id}`, { name: 'X' }, cookie, evil),
        params(created.id),
      ),
      await deleteGuestRoute(
        jsonRequest('DELETE', `/api/guests/${created.id}`, undefined, cookie, evil),
        params(created.id),
      ),
      await regenerateRoute(
        jsonRequest('POST', `/api/guests/${created.id}/regenerate-link`, undefined, cookie, evil),
        params(created.id),
      ),
    ];
    for (const res of responses) expect(res.status).toBe(403);
  });

  it('stops at 1,000 guests with LIMIT_REACHED', async () => {
    const { cookie, weddingId } = await adminWithWedding();
    await Guest.insertMany(
      Array.from({ length: 1000 }, (_, i) => ({
        weddingId: new Types.ObjectId(weddingId),
        name: `Guest ${i}`,
        maxPeople: 1,
        inviteLink: { token: `token-${i}`, issuedAt: new Date() },
        createdByUserId: new Types.ObjectId(),
      })),
    );
    const res = await createGuest(cookie, { name: 'One too many' });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('LIMIT_REACHED');
  });

  it('guests are tenant-guarded (DB §6.5)', async () => {
    await expect(Guest.find({ name: 'Sharma' }).lean()).rejects.toBeInstanceOf(UnscopedQueryError);
    await expect(Guest.aggregate([{ $match: {} }])).rejects.toBeInstanceOf(UnscopedQueryError);
  });

  describe('events and the dashboard read guests', () => {
    it('headcount, delete preview and the delete cascade (DB §13.2, §14.1)', async () => {
      const { cookie, weddingId } = await adminWithWedding();
      const haldi = await eventId(cookie, 'Haldi');
      const wedding = await eventId(cookie, 'Wedding', '2027-02-14');
      const sharma = await guest(cookie, { name: 'Sharma', invitedEventIds: [haldi, wedding] });
      const mehra = await guest(cookie, { name: 'Mehra', invitedEventIds: [haldi] });
      await rsvp(cookie, sharma.id, { status: 'ATTENDING', attendingCount: 3, expectedVersion: 0 });
      await rsvp(cookie, mehra.id, { status: 'ATTENDING', attendingCount: 2, expectedVersion: 0 });

      const haldiRes = await getEventRoute(
        getRequest(`/api/events/${haldi}`, cookie),
        params(haldi),
      );
      expect((await haldiRes.json()).headcount).toEqual({ households: 2, people: 5 });

      const preview = await previewRoute(
        getRequest(`/api/events/${haldi}/delete-preview`, cookie),
        params(haldi),
      );
      expect(await preview.json()).toMatchObject({
        invitedCount: 2,
        onlyThisEvent: { count: 1, names: ['Mehra'] },
      });

      const del = await deleteEventRoute(
        jsonRequest('DELETE', `/api/events/${haldi}`, undefined, cookie),
        params(haldi),
      );
      expect(del.status).toBe(204);
      const stored = await Guest.find({ weddingId }).sort({ name: 1 }).lean();
      expect(stored.map((g) => [g.name, g.invitedEvents.map((e) => String(e.eventId))])).toEqual([
        ['Mehra', []],
        ['Sharma', [wedding]],
      ]);
      // The RSVP is the guest's answer and is left alone.
      expect(stored[0]!.rsvp).toMatchObject({ status: 'ATTENDING', attendingCount: 2 });
      const log = await mongoose.connection
        .db!.collection('activity_logs')
        .findOne({ action: 'event.deleted' });
      expect(log!.meta).toEqual({ affectedGuests: 2, leftWithNoEvents: 1 });

      // Mehra is now invited to nothing: left out of the numbers and counted apart (§13.1).
      const dashboard = await getDashboard({
        weddingId: new Types.ObjectId(weddingId),
        wedding: { weddingDate: '2027-02-14', timezone: 'Asia/Kolkata' },
      });
      expect(dashboard.guests).toEqual({
        invitations: 1,
        peopleInvited: 4,
        attending: 1,
        notAttending: 0,
        pending: 0,
        peopleAttending: 3,
        respondedViaLink: 0,
        notInvitedToAnyEvent: 1,
      });
    });

    it("the wedding's isEmpty is false once it has a guest", async () => {
      const { cookie } = await adminWithWedding();
      const isEmpty = async () =>
        (
          (await (await getWeddingRoute(getRequest('/api/wedding', cookie))).json()) as {
            isEmpty: boolean;
          }
        ).isEmpty;
      expect(await isEmpty()).toBe(true);
      await guest(cookie, { name: 'Sharma' });
      expect(await isEmpty()).toBe(false);
    });
  });
});
