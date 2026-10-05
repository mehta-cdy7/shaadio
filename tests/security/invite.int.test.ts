import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as createEventRoute } from '@/app/api/events/route';
import { POST as regenerateRoute } from '@/app/api/guests/[id]/regenerate-link/route';
import { DELETE as deleteGuestRoute, GET as getGuestRoute } from '@/app/api/guests/[id]/route';
import { PATCH as memberRsvpRoute } from '@/app/api/guests/[id]/rsvp/route';
import { POST as createGuestRoute } from '@/app/api/guests/route';
import { POST as openedRoute } from '@/app/api/public/invite/[token]/opened/route';
import { GET as inviteRoute } from '@/app/api/public/invite/[token]/route';
import { POST as guestRsvpRoute } from '@/app/api/public/invite/[token]/rsvp/route';
import { PATCH as patchWeddingRoute } from '@/app/api/wedding/route';
import { addDays, todayIn } from '@/lib/dates';
import { Guest } from '@/modules/guests/guest.model';
import { getInvitation } from '@/modules/invitations';
import { Wedding } from '@/modules/weddings/wedding.model';
import { connectDb } from '@/server/db/connection';
import { adminWithWedding, getRequest, jsonRequest } from '../factories/api';

/**
 * Public invitation and RSVP (API_DESIGN §7, §8.1, §24, §30; DATABASE_DESIGN §6.3 #3, §10;
 * PRD §9.10–9.11) through the real route handlers on the in-memory replica set. Own database.
 */
process.env.MONGODB_URI = process.env.MONGODB_URI!.replace('/shaadioo-test', '/shaadioo-invite');

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });
const tokenParams = (token: string) => ({ params: Promise.resolve({ token }) });

type GuestBody = { id: string; version: number; inviteUrl: string };

function tokenOf(guest: GuestBody): string {
  return guest.inviteUrl.split('/invite/')[1]!;
}

async function eventId(cookie: string, name: string, date = '2027-02-12'): Promise<string> {
  const res = await createEventRoute(
    jsonRequest(
      'POST',
      '/api/events',
      {
        name,
        type: 'CUSTOM',
        date,
        startTime: '19:00',
        venue: {
          name: 'XYZ Resort',
          address: 'Dehradun',
          mapUrl: 'https://maps.google.com/?q=xyz',
        },
      },
      cookie,
    ),
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function guest(cookie: string, body: Record<string, unknown>): Promise<GuestBody> {
  const res = await createGuestRoute(
    jsonRequest(
      'POST',
      '/api/guests',
      {
        name: 'Sharma Family',
        phone: '+919530884388',
        email: 'sharma@example.com',
        maxPeople: 4,
        invitedEventIds: [],
        ...body,
      },
      cookie,
    ),
  );
  expect(res.status).toBe(201);
  return (await res.json()) as GuestBody;
}

async function open(token: string) {
  const res = await inviteRoute(getRequest(`/api/public/invite/${token}`), tokenParams(token));
  return { res, body: await res.json() };
}

async function answer(token: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await guestRsvpRoute(
    jsonRequest('POST', `/api/public/invite/${token}/rsvp`, body, undefined, headers),
    tokenParams(token),
  );
  return { res, body: await res.json() };
}

describe('public invitation security', () => {
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

  it('returns a minimal projection with only the invited events', async () => {
    const { cookie } = await adminWithWedding();
    const haldi = await eventId(cookie, 'Haldi', '2027-02-12');
    await eventId(cookie, 'Private dinner', '2027-02-13');
    const sharma = await guest(cookie, { invitedEventIds: [haldi] });

    const { res, body } = await open(tokenOf(sharma));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(body).toEqual({
      wedding: {
        brideName: 'Princi',
        groomName: 'Akshay',
        nameOrder: 'BRIDE_FIRST',
        weddingDate: expect.any(String),
        theme: 'CLASSIC',
      },
      guest: { name: 'Sharma Family', maxPeople: 4 },
      events: [
        {
          name: 'Haldi',
          type: 'CUSTOM',
          date: '2027-02-12',
          startTime: '19:00',
          venue: {
            name: 'XYZ Resort',
            address: 'Dehradun',
            mapUrl: 'https://maps.google.com/?q=xyz',
          },
        },
      ],
      rsvp: { status: 'PENDING', attendingCount: 0 },
      rsvpLocked: false,
    });
    // No ids, contacts or the token anywhere in the payload.
    const text = JSON.stringify(body);
    for (const secret of [sharma.id, haldi, '9530884388', 'sharma@example.com', tokenOf(sharma)]) {
      expect(text).not.toContain(secret);
    }
  });

  it('gives bad, regenerated, deleted-guest and deleting-wedding links the identical 404', async () => {
    const { cookie, weddingId } = await adminWithWedding();
    const haldi = await eventId(cookie, 'Haldi');
    const regenerated = await guest(cookie, { invitedEventIds: [haldi] });
    const deleted = await guest(cookie, { name: 'Gone', invitedEventIds: [haldi] });
    const oldToken = tokenOf(regenerated);
    const res = await regenerateRoute(
      jsonRequest('POST', `/api/guests/${regenerated.id}/regenerate-link`, undefined, cookie),
      idParams(regenerated.id),
    );
    expect(res.status).toBe(200);
    await deleteGuestRoute(
      jsonRequest('DELETE', `/api/guests/${deleted.id}`, undefined, cookie),
      idParams(deleted.id),
    );

    const other = await adminWithWedding('Meera');
    const otherGuest = await guest(other.cookie, { invitedEventIds: [] });
    await Wedding.updateOne(
      { _id: new Types.ObjectId(other.weddingId) },
      { $set: { status: 'DELETING' } },
    );

    const tokens = ['x', 'A'.repeat(22), oldToken, tokenOf(deleted), tokenOf(otherGuest)];
    const bodies = [];
    for (const token of tokens) {
      const get = await open(token);
      const post = await answer(token, { status: 'NOT_ATTENDING' });
      expect(get.res.status).toBe(404);
      expect(post.res.status).toBe(404);
      bodies.push(
        { ...get.body.error, requestId: undefined },
        { ...post.body.error, requestId: undefined },
      );
    }
    for (const body of bodies) expect(body).toEqual(bodies[0]);
    expect(weddingId).toBeTruthy();
  });

  it('records one answer for all events, within the allowed number', async () => {
    const { cookie } = await adminWithWedding();
    const haldi = await eventId(cookie, 'Haldi');
    const sharma = await guest(cookie, { invitedEventIds: [haldi] });
    const token = tokenOf(sharma);

    const yes = await answer(token, { status: 'ATTENDING', attendingCount: 4 });
    expect(yes.res.status).toBe(200);
    expect(yes.body).toEqual({
      rsvp: { status: 'ATTENDING', attendingCount: 4 },
      rsvpLocked: false,
    });

    const tooMany = await answer(token, { status: 'ATTENDING', attendingCount: 5 });
    expect(tooMany.res.status).toBe(409);
    expect(tooMany.body.error.code).toBe('CAPACITY_EXCEEDED');
    expect(tooMany.body.error.details).toEqual({ maxPeople: 4 });

    for (const body of [
      { status: 'PENDING' },
      { status: 'ATTENDING', attendingCount: 0 },
      { status: 'ATTENDING' },
      { status: 'NOT_ATTENDING', attendingCount: 2 },
      { status: 'ATTENDING', attendingCount: 2, weddingId: new Types.ObjectId().toHexString() },
    ]) {
      expect((await answer(token, body)).body.error.code).toBe('VALIDATION_ERROR');
    }

    // The guest can change their answer through the same link.
    const no = await answer(token, { status: 'NOT_ATTENDING' });
    expect(no.body.rsvp).toEqual({ status: 'NOT_ATTENDING', attendingCount: 0 });

    const member = await (
      await getGuestRoute(getRequest(`/api/guests/${sharma.id}`, cookie), idParams(sharma.id))
    ).json();
    expect(member.rsvp).toMatchObject({ status: 'NOT_ATTENDING', respondedVia: 'GUEST_LINK' });
    expect(member.version).toBeGreaterThan(sharma.version);
  });

  it('refuses an answer when the invitation has no events', async () => {
    const { cookie } = await adminWithWedding();
    const sharma = await guest(cookie, { invitedEventIds: [] });
    const { body } = await open(tokenOf(sharma));
    expect(body.events).toEqual([]);
    const res = await answer(tokenOf(sharma), { status: 'NOT_ATTENDING' });
    expect(res.res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_EVENTS');
  });

  it('locks guest answers after the deadline, but not member edits', async () => {
    const { cookie, weddingId } = await adminWithWedding();
    const haldi = await eventId(cookie, 'Haldi');
    const sharma = await guest(cookie, { invitedEventIds: [haldi] });
    const token = tokenOf(sharma);

    const today = todayIn('Asia/Kolkata');

    // The deadline day itself is still open.
    const setToday = await patchWeddingRoute(
      jsonRequest('PATCH', '/api/wedding', { rsvpDeadline: today }, cookie),
    );
    expect(setToday.status).toBe(200);
    expect((await answer(token, { status: 'ATTENDING', attendingCount: 2 })).res.status).toBe(200);

    // A day later the deadline has passed (simulated by moving it back in the database).
    await Wedding.updateOne(
      { _id: new Types.ObjectId(weddingId) },
      { $set: { rsvpDeadline: addDays(today, -1) } },
    );
    const { body } = await open(token);
    expect(body.rsvpLocked).toBe(true);
    expect(body.rsvpDeadline).toBe(addDays(today, -1));
    expect(body.rsvp).toEqual({ status: 'ATTENDING', attendingCount: 2 });

    const locked = await answer(token, { status: 'NOT_ATTENDING' });
    expect(locked.res.status).toBe(409);
    expect(locked.body.error.code).toBe('RSVP_LOCKED');

    const current = await (
      await getGuestRoute(getRequest(`/api/guests/${sharma.id}`, cookie), idParams(sharma.id))
    ).json();
    const memberEdit = await memberRsvpRoute(
      jsonRequest(
        'PATCH',
        `/api/guests/${sharma.id}/rsvp`,
        { status: 'NOT_ATTENDING', expectedVersion: current.version },
        cookie,
      ),
      idParams(sharma.id),
    );
    expect(memberEdit.status).toBe(200);
  });

  it("never shows another wedding's event, even if one is referenced", async () => {
    const a = await adminWithWedding();
    const b = await adminWithWedding('Meera');
    const aEvent = await eventId(a.cookie, 'Haldi');
    const bSecret = await eventId(b.cookie, 'B private party');
    const sharma = await guest(a.cookie, { invitedEventIds: [aEvent] });
    await Guest.updateOne(
      { _id: new Types.ObjectId(sharma.id), weddingId: new Types.ObjectId(a.weddingId) },
      { $push: { invitedEvents: { eventId: new Types.ObjectId(bSecret) } } },
    );
    const { body } = await open(tokenOf(sharma));
    expect(body.events.map((event: { name: string }) => event.name)).toEqual(['Haldi']);
  });

  it('marks the link opened only through the page script endpoint, once', async () => {
    const { cookie, weddingId } = await adminWithWedding();
    const sharma = await guest(cookie, {});
    const token = tokenOf(sharma);
    const scope = { _id: new Types.ObjectId(sharma.id), weddingId: new Types.ObjectId(weddingId) };
    const openedAt = async () => (await Guest.findOne(scope).lean())?.inviteLink.firstOpenedAt;
    const opened = (body: unknown = {}, headers: Record<string, string> = {}) =>
      openedRoute(
        jsonRequest('POST', `/api/public/invite/${token}/opened`, body, undefined, headers),
        tokenParams(token),
      );

    // Reading (the API, or the page's server render) is what a link-preview bot does.
    await open(token);
    await getInvitation(token);
    expect(await openedAt()).toBeUndefined();

    expect((await opened({}, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await opened({ at: 'now' })).status).toBe(400);
    expect(await openedAt()).toBeUndefined();

    const res = await opened();
    expect(res.status).toBe(204);
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    const first = await openedAt();
    expect(first).toBeInstanceOf(Date);
    expect((await opened()).status).toBe(204);
    expect(await openedAt()).toEqual(first);

    const bad = await openedRoute(
      jsonRequest('POST', '/api/public/invite/x/opened', {}),
      tokenParams('x'),
    );
    expect(bad.status).toBe(404);
  });

  it('keeps the RSVP deadline today or later and on or before the wedding date', async () => {
    const { cookie, weddingDate } = await adminWithWedding();
    const today = todayIn('Asia/Kolkata');
    const patch = async (body: Record<string, unknown>) => {
      const res = await patchWeddingRoute(jsonRequest('PATCH', '/api/wedding', body, cookie));
      return { status: res.status, body: await res.json() };
    };

    const past = await patch({ rsvpDeadline: addDays(today, -1) });
    expect(past.status).toBe(400);
    expect(Object.keys(past.body.error.details.fields)).toEqual(['rsvpDeadline']);
    const late = await patch({ rsvpDeadline: addDays(weddingDate, 1) });
    expect(late.status).toBe(400);
    expect(Object.keys(late.body.error.details.fields)).toEqual(['rsvpDeadline']);

    expect((await patch({ rsvpDeadline: weddingDate })).status).toBe(200);
    // The wedding cannot move before the deadline...
    const earlier = await patch({ weddingDate: addDays(weddingDate, -1) });
    expect(earlier.status).toBe(400);
    expect(Object.keys(earlier.body.error.details.fields)).toEqual(['weddingDate']);
    // ...unless the deadline moves in the same save, or is removed first.
    const both = await patch({ weddingDate: addDays(weddingDate, -2), rsvpDeadline: today });
    expect(both.status).toBe(200);
    expect((await patch({ rsvpDeadline: null })).body.rsvpDeadline).toBeUndefined();
    expect((await patch({ weddingDate: addDays(today, 1) })).status).toBe(200);
  });

  it('rejects a cross-origin RSVP', async () => {
    const { cookie } = await adminWithWedding();
    const haldi = await eventId(cookie, 'Haldi');
    const sharma = await guest(cookie, { invitedEventIds: [haldi] });
    const { res } = await answer(
      tokenOf(sharma),
      { status: 'NOT_ATTENDING' },
      { origin: 'https://evil.example' },
    );
    expect(res.status).toBe(403);
  });

  it('rate-limits answers per invitation (20 / 15 min)', async () => {
    const { cookie } = await adminWithWedding();
    const haldi = await eventId(cookie, 'Haldi');
    const sharma = await guest(cookie, { invitedEventIds: [haldi] });
    for (let i = 0; i < 20; i++) {
      expect((await answer(tokenOf(sharma), { status: 'NOT_ATTENDING' })).res.status).toBe(200);
    }
    const limited = await answer(tokenOf(sharma), { status: 'NOT_ATTENDING' });
    expect(limited.res.status).toBe(429);
    expect(limited.res.headers.get('retry-after')).toBeTruthy();
  });
});
