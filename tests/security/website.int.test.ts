import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as createEventRoute } from '@/app/api/events/route';
import { POST as createGuestRoute } from '@/app/api/guests/route';
import { POST as inviteRoute } from '@/app/api/member-invitations/route';
import { POST as publishRoute } from '@/app/api/website/publish/route';
import { GET as getWebsiteRoute, PATCH as patchWebsiteRoute } from '@/app/api/website/route';
import { POST as unpublishRoute } from '@/app/api/website/unpublish/route';
import { POST as signupRoute } from '@/app/api/auth/signup/route';
import { findPublicWebsite } from '@/modules/weddings';
import { connectDb } from '@/server/db/connection';
import { adminWithWedding, getRequest, jsonRequest, sidFrom, signUp } from '../factories/api';

/**
 * Wedding website (PRD §9.18, API_DESIGN §20, SYSTEM_DESIGN §26) through the real route handlers
 * and the public page's service, on the in-memory replica set. Own database.
 */
process.env.MONGODB_URI = process.env.MONGODB_URI!.replace('/shaadio-test', '/shaadio-website');

type Website = {
  url: string;
  published: boolean;
  publishedAt?: string;
  theme: string;
  welcomeMessage?: string;
};

const db = () => mongoose.connection.db!;
const slugOf = (website: Website) => website.url.split('/w/')[1]!;

async function website(cookie: string | undefined) {
  return getWebsiteRoute(getRequest('/api/website', cookie));
}

async function websiteBody(cookie: string): Promise<Website> {
  const res = await website(cookie);
  expect(res.status).toBe(200);
  return (await res.json()) as Website;
}

function patch(cookie: string, body: unknown) {
  return patchWebsiteRoute(jsonRequest('PATCH', '/api/website', body, cookie));
}

function publish(cookie: string) {
  return publishRoute(jsonRequest('POST', '/api/website/publish', {}, cookie));
}

function unpublish(cookie: string) {
  return unpublishRoute(jsonRequest('POST', '/api/website/unpublish', {}, cookie));
}

async function addEvent(cookie: string, name: string, date: string, extra = {}) {
  const res = await createEventRoute(
    jsonRequest('POST', '/api/events', { name, type: 'CUSTOM', date, ...extra }, cookie),
  );
  expect(res.status).toBe(201);
}

/** A Manager in the admin's wedding, joined by invitation. */
async function manager(adminCookie: string): Promise<string> {
  const email = `manager-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const sent = await inviteRoute(
    jsonRequest('POST', '/api/member-invitations', { email, role: 'MANAGER' }, adminCookie),
  );
  const token = ((await sent.json()) as { joinUrl: string }).joinUrl.split('/join/')[1]!;
  const res = await signupRoute(
    jsonRequest('POST', '/api/auth/signup', {
      name: 'Meera',
      email,
      password: 'plum-and-brass-2026',
      memberInviteToken: token,
    }),
  );
  expect(res.status).toBe(201);
  return sidFrom(res);
}

describe('website security', () => {
  beforeAll(async () => {
    await connectDb();
  });

  beforeEach(async () => {
    await Promise.all(
      [
        'users',
        'sessions',
        'rate_limits',
        'weddings',
        'wedding_memberships',
        'member_invitations',
        'events',
        'guests',
        'activity_logs',
      ].map((name) =>
        db()
          .dropCollection(name)
          .catch(() => undefined),
      ),
    );
    await Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes()));
  });

  afterAll(async () => {
    await db().dropDatabase();
    await mongoose.disconnect();
  });

  it('requires a session and a wedding', async () => {
    expect((await website(undefined)).status).toBe(401);
    const res = await website(await signUp('Ravi'));
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('NO_WEDDING');
  });

  it('starts as a draft that the public cannot see', async () => {
    const { cookie } = await adminWithWedding();
    const body = await websiteBody(cookie);
    expect(body).toMatchObject({ published: false, theme: 'CLASSIC' });
    expect(body.url).toMatch(/\/w\/princi-akshay-[a-z0-9]{6}$/);
    expect(await findPublicWebsite(slugOf(body))).toBeUndefined();
  });

  it('publish shows the site, unpublish hides it at once, and both are logged once', async () => {
    const { cookie } = await adminWithWedding();
    const slug = slugOf(await websiteBody(cookie));

    const published = (await (await publish(cookie)).json()) as Website;
    expect(published.published).toBe(true);
    expect(published.publishedAt).toBeTruthy();
    expect(await findPublicWebsite(slug)).toBeDefined();
    // A repeat changes nothing and logs nothing.
    expect((await publish(cookie)).status).toBe(200);

    const hidden = (await (await unpublish(cookie)).json()) as Website;
    expect(hidden).toMatchObject({ published: false });
    expect(hidden).not.toHaveProperty('publishedAt');
    expect(await findPublicWebsite(slug)).toBeUndefined();

    const actions = (await db().collection('activity_logs').find().toArray()).map((l) => l.action);
    expect(actions).toEqual(['website.published', 'website.unpublished']);
  });

  it('Managers can edit and publish too', async () => {
    const { cookie } = await adminWithWedding();
    const managerCookie = await manager(cookie);
    expect((await patch(managerCookie, { welcomeMessage: 'Hello' })).status).toBe(200);
    expect((await publish(managerCookie)).status).toBe(200);
  });

  it('PATCH sets and clears the welcome message and accepts only the Classic theme', async () => {
    const { cookie } = await adminWithWedding();
    const set = (await (
      await patch(cookie, { welcomeMessage: '  Come celebrate!  ' })
    ).json()) as Website;
    expect(set.welcomeMessage).toBe('Come celebrate!');
    const cleared = (await (await patch(cookie, { welcomeMessage: null })).json()) as Website;
    expect(cleared).not.toHaveProperty('welcomeMessage');
    const stored = await db().collection('weddings').findOne({});
    expect(stored!.website).not.toHaveProperty('welcomeMessage');

    expect((await patch(cookie, { theme: 'CLASSIC' })).status).toBe(200);
    for (const body of [
      { theme: 'MODERN' },
      { welcomeMessage: 'x'.repeat(1001) },
      {},
      { slug: 'my-own-slug' },
      { published: true },
    ]) {
      expect((await patch(cookie, body)).status).toBe(400);
    }
  });

  it('the public website has only published fields, all events in date order, nothing else', async () => {
    const { cookie, weddingDate } = await adminWithWedding();
    await addEvent(cookie, 'Sangeet', weddingDate, { dressCode: 'Glitz' });
    await addEvent(cookie, 'Haldi', weddingDate.replace(/\d{2}$/, '01'));
    await createGuestRoute(
      jsonRequest(
        'POST',
        '/api/guests',
        { name: 'Sharma Family', email: 'sharma@example.com', maxPeople: 2, invitedEventIds: [] },
        cookie,
      ),
    );
    await patch(cookie, { welcomeMessage: 'Welcome!' });
    await publish(cookie);
    const site = await findPublicWebsite(slugOf(await websiteBody(cookie)));

    expect(Object.keys(site!).sort()).toEqual(
      [
        'brideName',
        'city',
        'events',
        'groomName',
        'nameOrder',
        'theme',
        'weddingDate',
        'welcomeMessage',
      ].sort(),
    );
    expect(site!.events.map((event) => event.name)).toEqual(['Haldi', 'Sangeet']);
    for (const event of site!.events) {
      expect(Object.keys(event)).not.toContain('id');
      expect(Object.keys(event)).not.toContain('headcount');
    }
    const text = JSON.stringify(site);
    expect(text).not.toContain('sharma@example.com');
    expect(text).not.toContain('Sharma Family');
  });

  it('never shows another wedding, a deleting wedding, or a malformed slug', async () => {
    const a = await adminWithWedding();
    const b = await adminWithWedding('Arjun');
    await publish(a.cookie);
    const aSlug = slugOf(await websiteBody(a.cookie));
    const bSlug = slugOf(await websiteBody(b.cookie));

    // B's draft stays hidden while A's is live; A's controls never touch B.
    expect(await findPublicWebsite(bSlug)).toBeUndefined();
    expect((await websiteBody(b.cookie)).published).toBe(false);

    for (const slug of ['', 'A-B', '../etc', 'x'.repeat(200), aSlug.toUpperCase()]) {
      expect(await findPublicWebsite(slug)).toBeUndefined();
    }

    await db()
      .collection('weddings')
      .updateOne({ _id: new Types.ObjectId(a.weddingId) }, { $set: { status: 'DELETING' } });
    expect(await findPublicWebsite(aSlug)).toBeUndefined();
  });

  it('publish and unpublish are mutations: Origin and JSON are checked', async () => {
    const { cookie } = await adminWithWedding();
    const res = await publishRoute(
      jsonRequest('POST', '/api/website/publish', {}, cookie, { origin: 'https://evil.example' }),
    );
    expect(res.status).toBe(403);
    expect((await websiteBody(cookie)).published).toBe(false);
  });
});
