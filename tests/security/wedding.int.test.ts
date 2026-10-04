import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as loginRoute } from '@/app/api/auth/login/route';
import { POST as signupRoute } from '@/app/api/auth/signup/route';
import { GET as meRoute } from '@/app/api/me/route';
import {
  GET as getWeddingRoute,
  PATCH as patchWeddingRoute,
  POST as createWeddingRoute,
} from '@/app/api/wedding/route';
import { addDays, todayIn } from '@/lib/dates';
import { connectDb } from '@/server/db/connection';
import { UnscopedQueryError } from '@/server/db/tenant-guard';
import { Membership } from '@/modules/members/membership.model';

/**
 * Wedding creation and the wedding context (API_DESIGN §3, §11, §30; DATABASE_DESIGN §5.4–§5.5,
 * §6.5; PRD Rule 1 and §9.2), through the real route handlers on the in-memory replica set.
 * Own database, so other files dropping collections cannot interfere.
 */
process.env.MONGODB_URI = process.env.MONGODB_URI!.replace('/shaadioo-test', '/shaadioo-wedding');

const ORIGIN = process.env.APP_ORIGIN!;
let ipCounter = 0;

function post(path: string, body: unknown, cookie?: string): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      origin: ORIGIN,
      'content-type': 'application/json',
      'x-real-ip': `10.1.0.${++ipCounter % 250}`,
      ...(cookie ? { cookie } : {}),
    },
  });
}

function patch(body: unknown, cookie?: string): Request {
  return new Request(`${ORIGIN}/api/wedding`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: {
      origin: ORIGIN,
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
  });
}

function get(path: string, cookie?: string): Request {
  return new Request(`${ORIGIN}${path}`, { headers: cookie ? { cookie } : {} });
}

function sidFrom(res: Response): string {
  const match = /sid=([^;]*)/.exec(res.headers.get('set-cookie') ?? '');
  if (!match?.[1]) throw new Error('no session cookie');
  return `sid=${match[1]}`;
}

let userCounter = 0;
async function signUp(name = 'Priya Sharma'): Promise<string> {
  const res = await signupRoute(
    post('/api/auth/signup', {
      name,
      email: `user${++userCounter}@example.com`,
      password: 'plum-and-brass-2026',
    }),
  );
  expect(res.status).toBe(201);
  return sidFrom(res);
}

const futureDate = () => addDays(todayIn('Asia/Kolkata'), 120);

const weddingBody = () => ({
  brideName: 'Princi',
  groomName: 'Akshay',
  weddingDate: futureDate(),
  location: { formattedAddress: 'Dehradun, Uttarakhand', city: 'Dehradun' },
});

async function createWedding(cookie: string, body: unknown = weddingBody()) {
  return createWeddingRoute(post('/api/wedding', body, cookie));
}

describe('wedding security', () => {
  beforeAll(async () => {
    await connectDb();
  });

  beforeEach(async () => {
    const db = mongoose.connection.db!;
    await Promise.all(
      ['users', 'sessions', 'rate_limits', 'weddings', 'wedding_memberships'].map((name) =>
        db.dropCollection(name).catch(() => undefined),
      ),
    );
    await Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes()));
  });

  afterAll(async () => {
    await mongoose.connection.db!.dropDatabase();
    await mongoose.disconnect();
  });

  it('requires a session to create or read a wedding', async () => {
    expect((await createWedding('')).status).toBe(401);
    expect((await getWeddingRoute(get('/api/wedding'))).status).toBe(401);
  });

  it('creates the wedding with the caller as its first Admin, without leaking secrets', async () => {
    const cookie = await signUp();
    const res = await createWedding(cookie);
    expect(res.status).toBe(201);
    const wedding = await res.json();
    expect(wedding).toMatchObject({
      brideName: 'Princi',
      groomName: 'Akshay',
      nameOrder: 'BRIDE_FIRST',
      timezone: 'Asia/Kolkata',
      rsvpLocked: false,
      isEmpty: true,
    });
    const raw = JSON.stringify(wedding);
    for (const secret of ['gallery', 'token', 'counters', 'status', 'slug', 'createdByUserId']) {
      expect(raw).not.toContain(secret);
    }

    const db = mongoose.connection.db!;
    const stored = await db.collection('weddings').findOne({});
    expect(stored?.website.slug).toMatch(/^princi-akshay-[a-z0-9]{6}$/);
    expect(stored?.gallery.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(stored?.counters).toEqual({ adminCount: 1, photoSlotsUsed: 0, featuredPhotoCount: 0 });
    const membership = await db.collection('wedding_memberships').findOne({});
    expect(membership).toMatchObject({ weddingId: stored!._id, role: 'ADMIN' });
  });

  it('uses the chosen name order for the slug and the response', async () => {
    const res = await createWedding(await signUp(), { ...weddingBody(), nameOrder: 'GROOM_FIRST' });
    expect((await res.json()).nameOrder).toBe('GROOM_FIRST');
    const stored = await mongoose.connection.db!.collection('weddings').findOne({});
    expect(stored?.website.slug).toMatch(/^akshay-princi-[a-z0-9]{6}$/);
  });

  it('a second wedding for the same user is ALREADY_MEMBER (PRD Rule 1)', async () => {
    const cookie = await signUp();
    expect((await createWedding(cookie)).status).toBe(201);
    const res = await createWedding(cookie);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('ALREADY_MEMBER');
  });

  it('two concurrent creates by one user leave exactly one wedding', async () => {
    const cookie = await signUp();
    const results = await Promise.all([createWedding(cookie), createWedding(cookie)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const db = mongoose.connection.db!;
    expect(await db.collection('weddings').countDocuments()).toBe(1);
    expect(await db.collection('wedding_memberships').countDocuments()).toBe(1);
  });

  it('rejects past dates, unknown fields and server-owned fields', async () => {
    const cookie = await signUp();
    const yesterday = addDays(todayIn('Asia/Kolkata'), -1);
    const past = await createWedding(cookie, { ...weddingBody(), weddingDate: yesterday });
    expect(past.status).toBe(400);
    expect((await past.json()).error.details.fields).toHaveProperty('weddingDate');

    for (const extra of [
      { weddingId: new Types.ObjectId().toHexString() },
      { createdByUserId: 'x' },
      { gallery: { token: 'mine' } },
      { website: { slug: 'chosen' } },
    ]) {
      expect((await createWedding(cookie, { ...weddingBody(), ...extra })).status).toBe(400);
    }
    expect(await mongoose.connection.db!.collection('weddings').countDocuments()).toBe(0);
  });

  it('accepts today as the wedding date', async () => {
    const res = await createWedding(await signUp(), {
      ...weddingBody(),
      weddingDate: todayIn('Asia/Kolkata'),
    });
    expect(res.status).toBe(201);
  });

  it('GET /api/wedding is NO_WEDDING without a membership', async () => {
    const res = await getWeddingRoute(get('/api/wedding', await signUp()));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('NO_WEDDING');
  });

  it('each member sees only their own wedding', async () => {
    const asha = await signUp('Asha');
    const ravi = await signUp('Ravi');
    await createWedding(asha);
    await createWedding(ravi, { ...weddingBody(), brideName: 'Meera', groomName: 'Ravi' });

    const ashaWedding = await (await getWeddingRoute(get('/api/wedding', asha))).json();
    const raviWedding = await (await getWeddingRoute(get('/api/wedding', ravi))).json();
    expect(ashaWedding.brideName).toBe('Princi');
    expect(raviWedding.brideName).toBe('Meera');
    expect(ashaWedding.id).not.toBe(raviWedding.id);
  });

  it('a DELETING wedding counts as no wedding', async () => {
    const cookie = await signUp();
    await createWedding(cookie);
    await mongoose.connection.db!.collection('weddings').updateMany(
      {},
      {
        $set: { status: 'DELETING' },
      },
    );
    expect((await getWeddingRoute(get('/api/wedding', cookie))).status).toBe(403);
  });

  it('/api/me and login include the membership and wedding once one exists', async () => {
    const email = `user${++userCounter}@example.com`;
    const password = 'plum-and-brass-2026';
    const cookie = sidFrom(
      await signupRoute(post('/api/auth/signup', { name: 'Priya', email, password })),
    );
    expect(await (await meRoute(get('/api/me', cookie))).json()).not.toHaveProperty('wedding');

    await createWedding(cookie);
    const expected = {
      membership: { role: 'ADMIN' },
      wedding: { brideName: 'Princi', groomName: 'Akshay', nameOrder: 'BRIDE_FIRST' },
    };
    expect(await (await meRoute(get('/api/me', cookie))).json()).toMatchObject(expected);
    const login = await loginRoute(post('/api/auth/login', { email, password }));
    expect(await login.json()).toMatchObject(expected);
  });

  it('memberships are tenant-guarded (DATABASE_DESIGN §6.5)', async () => {
    await expect(Membership.find({ userId: new Types.ObjectId() }).lean()).rejects.toBeInstanceOf(
      UnscopedQueryError,
    );
    await expect(Membership.aggregate([{ $match: { role: 'ADMIN' } }])).rejects.toBeInstanceOf(
      UnscopedQueryError,
    );
  });

  describe('PATCH /api/wedding', () => {
    async function adminWithWedding() {
      const cookie = await signUp();
      expect((await createWedding(cookie)).status).toBe(201);
      return cookie;
    }

    it('requires a session and a wedding', async () => {
      expect((await patchWeddingRoute(patch({ title: 'x' }))).status).toBe(401);
      const res = await patchWeddingRoute(patch({ title: 'x' }, await signUp()));
      expect((await res.json()).error.code).toBe('NO_WEDDING');
    });

    it('updates only the caller’s wedding and keeps the slug', async () => {
      const asha = await adminWithWedding();
      const ravi = await adminWithWedding();
      const db = mongoose.connection.db!;
      const before = await db.collection('weddings').find().sort({ _id: 1 }).toArray();

      const res = await patchWeddingRoute(
        patch({ brideName: 'Meera', groomName: 'Arjun', nameOrder: 'GROOM_FIRST' }, asha),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        brideName: 'Meera',
        groomName: 'Arjun',
        nameOrder: 'GROOM_FIRST',
      });

      const after = await db.collection('weddings').find().sort({ _id: 1 }).toArray();
      expect(after[0]!.website.slug).toBe(before[0]!.website.slug);
      expect(after[1]).toEqual(before[1]);
      const raviWedding = await (await getWeddingRoute(get('/api/wedding', ravi))).json();
      expect(raviWedding.brideName).toBe('Princi');
    });

    it('lets a Manager edit too (API §9)', async () => {
      const admin = await adminWithWedding();
      const manager = await signUp('Manager');
      const db = mongoose.connection.db!;
      const wedding = await db.collection('weddings').findOne({});
      const managerUser = await db.collection('users').findOne({ name: 'Manager' });
      await db.collection('wedding_memberships').insertOne({
        weddingId: wedding!._id,
        userId: managerUser!._id,
        role: 'MANAGER',
        joinedAt: new Date(),
      });
      expect((await patchWeddingRoute(patch({ title: 'From the manager' }, manager))).status).toBe(
        200,
      );
      const read = await (await getWeddingRoute(get('/api/wedding', admin))).json();
      expect(read.title).toBe('From the manager');
    });

    it('null clears an optional field, which is then absent', async () => {
      const cookie = await adminWithWedding();
      await patchWeddingRoute(patch({ title: 'Shaadi', description: 'Note' }, cookie));
      const res = await patchWeddingRoute(patch({ title: null }, cookie));
      const body = await res.json();
      expect(body).not.toHaveProperty('title');
      expect(body.description).toBe('Note');
      const stored = await mongoose.connection.db!.collection('weddings').findOne({});
      expect(stored).not.toHaveProperty('title');
    });

    it('replacing the location drops the old place details but keeps the country', async () => {
      const cookie = await adminWithWedding();
      const db = mongoose.connection.db!;
      await db
        .collection('weddings')
        .updateMany(
          {},
          { $set: { 'location.lat': 30.3, 'location.lng': 78.0, 'location.googlePlaceId': 'p1' } },
        );
      const body = await (
        await patchWeddingRoute(
          patch({ location: { formattedAddress: 'Jaipur', city: 'Jaipur' } }, cookie),
        )
      ).json();
      expect(body.location).toEqual({
        formattedAddress: 'Jaipur',
        city: 'Jaipur',
        country: 'India',
      });
    });

    it('a save without location leaves the stored location untouched', async () => {
      const cookie = await adminWithWedding();
      const db = mongoose.connection.db!;
      await db
        .collection('weddings')
        .updateMany(
          {},
          { $set: { 'location.lat': 30.3, 'location.lng': 78.0, 'location.googlePlaceId': 'p1' } },
        );
      const before = (await db.collection('weddings').findOne({}))!.location;
      expect(before.country).toBe('India');
      await patchWeddingRoute(patch({ title: 'Only the title' }, cookie));
      expect((await db.collection('weddings').findOne({}))!.location).toEqual(before);
    });

    it('a new date must be today or later; other fields stay editable after the day', async () => {
      const cookie = await adminWithWedding();
      const yesterday = addDays(todayIn('Asia/Kolkata'), -1);
      const past = await patchWeddingRoute(patch({ weddingDate: yesterday }, cookie));
      expect(past.status).toBe(400);
      expect((await past.json()).error.details.fields).toHaveProperty('weddingDate');

      // A wedding whose day has passed: resending its own date with another change still works.
      const db = mongoose.connection.db!;
      await db.collection('weddings').updateMany({}, { $set: { weddingDate: yesterday } });
      const res = await patchWeddingRoute(
        patch({ weddingDate: yesterday, title: 'Memories' }, cookie),
      );
      expect(res.status).toBe(200);
      expect((await res.json()).title).toBe('Memories');
    });

    it('rejects server-owned and non-editable fields without writing', async () => {
      const cookie = await adminWithWedding();
      const db = mongoose.connection.db!;
      const before = await db.collection('weddings').findOne({});
      for (const body of [
        { timezone: 'Asia/Dubai' },
        { status: 'DELETING' },
        { website: { slug: 'mine' } },
        { gallery: { token: 'mine' } },
        { counters: { adminCount: 0 } },
        { brideName: null },
        { weddingId: new Types.ObjectId().toHexString() },
      ]) {
        expect((await patchWeddingRoute(patch(body, cookie))).status).toBe(400);
      }
      expect(await db.collection('weddings').findOne({})).toEqual(before);
    });

    it('requires the app origin (CSRF, API §2.2)', async () => {
      const cookie = await adminWithWedding();
      const req = new Request(`${ORIGIN}/api/wedding`, {
        method: 'PATCH',
        body: JSON.stringify({ title: 'x' }),
        headers: { origin: 'https://evil.example', 'content-type': 'application/json', cookie },
      });
      expect((await patchWeddingRoute(req)).status).toBe(403);
    });
  });
});
