import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as createEventRoute } from '@/app/api/events/route';
import {
  GET as getSettingsRoute,
  PATCH as patchSettingsRoute,
} from '@/app/api/gallery/settings/route';
import { GET as memberListRoute } from '@/app/api/photos/route';
import { POST as cancelRoute } from '@/app/api/public/gallery/[token]/cancel/route';
import { POST as completeRoute } from '@/app/api/public/gallery/[token]/complete/route';
import { GET as photosRoute } from '@/app/api/public/gallery/[token]/photos/route';
import { GET as galleryRoute } from '@/app/api/public/gallery/[token]/route';
import { POST as uploadRequestRoute } from '@/app/api/public/gallery/[token]/upload-requests/route';
import { connectDb } from '@/server/db/connection';
import { adminWithWedding, getRequest, jsonRequest } from '../factories/api';

/**
 * The guest gallery (API_DESIGN §7, §22, §25; SYSTEM_DESIGN §24, §97) through the real route
 * handlers, with R2 replaced by an in-memory bucket as in photos.int.test.ts.
 */
process.env.MONGODB_URI = process.env.MONGODB_URI!.replace('/shaadio-test', '/shaadio-gallery');

const bucket = vi.hoisted(() => new Map<string, { body: Uint8Array; contentType?: string }>());

vi.mock('@/server/storage/storage', () => ({
  UPLOAD_URL_SECONDS: 3600,
  StorageNotConfiguredError: class extends Error {},
  storageConfigured: () => true,
  signUploadUrl: async (key: string) => `https://r2.test/${key}?signed`,
  headObject: async (key: string) => {
    const object = bucket.get(key);
    return object ? { size: object.body.length, contentType: object.contentType } : undefined;
  },
  readObjectStart: async (key: string, length = 16) => bucket.get(key)?.body.slice(0, length),
  copyObject: async (from: string, to: string, contentType: string) => {
    const object = bucket.get(from);
    if (!object) throw new Error('NoSuchKey');
    bucket.set(to, { body: object.body, contentType });
  },
  deleteObjects: async (keys: string[]) => {
    for (const key of keys) bucket.delete(key);
  },
  deletePrefix: async () => 0,
  publicUrl: (key: string) => `https://media.test/${key}`,
  optionalPublicUrl: (key?: string | null) => (key ? `https://media.test/${key}` : undefined),
}));

const params = (token: string) => ({ params: Promise.resolve({ token }) });
const DEVICE = 'device-aaaaaaaaaaaaaaaa';
const OTHER_DEVICE = 'device-bbbbbbbbbbbbbbbb';

const declared = () => ({
  mimeType: 'image/webp',
  displayBytes: 1000,
  thumbBytes: 200,
  width: 1600,
  height: 1200,
});

function webp(length: number): Uint8Array {
  const body = new Uint8Array(length);
  body.set(new TextEncoder().encode('RIFF\x00\x00\x00\x00WEBP'));
  return body;
}

const keyOf = (url: string) => decodeURIComponent(new URL(url).pathname.slice(1));
const db = () => mongoose.connection.db!;

type Ticket = { uploadId: string; displayPutUrl: string; thumbPutUrl: string };

async function galleryToken(cookie: string): Promise<string> {
  const settings = await (
    await getSettingsRoute(getRequest('/api/gallery/settings', cookie))
  ).json();
  return (settings.galleryUrl as string).split('/').pop()!;
}

function post(path: string, body: unknown, device: string | null = DEVICE, ip?: string) {
  return jsonRequest('POST', path, body, undefined, {
    ...(device ? { 'x-device-id': device } : {}),
    ...(ip ? { 'x-real-ip': ip } : {}),
  });
}

async function request(token: string, body: unknown, device: string | null = DEVICE, ip?: string) {
  return uploadRequestRoute(
    post(`/api/public/gallery/${token}/upload-requests`, body, device, ip),
    params(token),
  );
}

async function guestUpload(token: string, count = 1, extra: Record<string, unknown> = {}) {
  const res = await request(token, { ...extra, photos: Array.from({ length: count }, declared) });
  expect(res.status).toBe(200);
  const { uploads } = (await res.json()) as { uploads: Ticket[] };
  for (const ticket of uploads) {
    bucket.set(keyOf(ticket.displayPutUrl), { body: webp(1000), contentType: 'image/webp' });
    bucket.set(keyOf(ticket.thumbPutUrl), { body: webp(200), contentType: 'image/webp' });
  }
  return uploads;
}

async function complete(token: string, uploadIds: string[], device = DEVICE) {
  return completeRoute(
    post(`/api/public/gallery/${token}/complete`, { uploadIds }, device),
    params(token),
  );
}

describe('guest gallery security', () => {
  beforeAll(async () => {
    await connectDb();
  });

  beforeEach(async () => {
    bucket.clear();
    await Promise.all(
      [
        'users',
        'sessions',
        'rate_limits',
        'weddings',
        'wedding_memberships',
        'events',
        'activity_logs',
        'photos',
        'photo_uploads',
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

  it('every bad token is the same 404 on every endpoint, with noindex headers', async () => {
    const { cookie, weddingId } = await adminWithWedding();
    const real = await galleryToken(cookie);
    await db()
      .collection('weddings')
      .updateOne({ _id: new Types.ObjectId(weddingId) }, { $set: { status: 'DELETING' } });

    const bodies = new Set<string>();
    for (const token of ['nope', 'A'.repeat(22), `${real}x`, real]) {
      for (const res of [
        await galleryRoute(getRequest(`/api/public/gallery/${token}`), params(token)),
        await photosRoute(getRequest(`/api/public/gallery/${token}/photos`), params(token)),
        await request(token, { photos: [declared()] }),
        await complete(token, [new Types.ObjectId().toHexString()]),
        await cancelRoute(
          post(`/api/public/gallery/${token}/cancel`, {
            uploadIds: [new Types.ObjectId().toHexString()],
          }),
          params(token),
        ),
      ]) {
        expect(res.status).toBe(404);
        const { error } = await res.json();
        bodies.add(`${error.code}:${error.message}`);
      }
    }
    expect([...bodies]).toEqual(['NOT_FOUND:This link is not available.']);
  });

  it('shows the couple, albums and switches; no ids, counts or other wedding data', async () => {
    const { cookie } = await adminWithWedding();
    const token = await galleryToken(cookie);
    await createEventRoute(
      jsonRequest(
        'POST',
        '/api/events',
        { name: 'Sangeet', type: 'SANGEET', date: '2027-02-12' },
        cookie,
      ),
    );
    const res = await galleryRoute(getRequest(`/api/public/gallery/${token}`), params(token));
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual([
      'albums',
      'photosPurged',
      'uploadEnabled',
      'viewEnabled',
      'wedding',
    ]);
    expect(body.wedding).toEqual({
      brideName: 'Princi',
      groomName: 'Akshay',
      nameOrder: 'BRIDE_FIRST',
    });
    expect(body.albums).toEqual([{ eventId: expect.any(String), name: 'Sangeet' }]);
    expect(JSON.stringify(body)).not.toMatch(/weddingDate|location|counters|token|email/i);
  });

  it('a guest upload is published as GUEST with their name and shows to members and guests', async () => {
    const { cookie, weddingId } = await adminWithWedding();
    const token = await galleryToken(cookie);
    const uploads = await guestUpload(token, 2, { uploaderName: '  Meera Aunty  ' });
    const res = await complete(
      token,
      uploads.map((u) => u.uploadId),
    );
    const { results } = await res.json();
    expect(results.map((r: { status: string }) => r.status)).toEqual(['PUBLISHED', 'PUBLISHED']);

    const stored = await db().collection('photos').findOne({});
    expect(stored).toMatchObject({ uploaderType: 'GUEST', uploaderName: 'Meera Aunty' });
    const pendingDevice = await db()
      .collection('photos')
      .findOne({ deviceIdHash: { $exists: true } });
    expect(pendingDevice).toBeNull();
    const wedding = await db()
      .collection('weddings')
      .findOne({ _id: new Types.ObjectId(weddingId) });
    expect(wedding!.counters.photoSlotsUsed).toBe(2);

    const members = await (
      await memberListRoute(getRequest('/api/photos?uploaderType=GUEST', cookie))
    ).json();
    expect(members.items).toHaveLength(2);

    const guests = await (
      await photosRoute(getRequest(`/api/public/gallery/${token}/photos`), params(token))
    ).json();
    expect(guests.items).toHaveLength(2);
    expect(guests.items[0]).not.toHaveProperty('featured');
    expect(guests.items[0]).not.toHaveProperty('uploaderType');
    expect(guests.items[0].uploaderName).toBe('Meera Aunty');
  });

  it('the device id is required and hashed; another device cannot finish or cancel my upload', async () => {
    const { cookie } = await adminWithWedding();
    const token = await galleryToken(cookie);
    for (const device of [null, 'short', 'x'.repeat(65), 'has space in it!!']) {
      const res = await request(token, { photos: [declared()] }, device);
      expect(res.status).toBe(400);
    }

    const [ticket] = await guestUpload(token);
    const stored = await db().collection('photo_uploads').findOne({});
    expect(stored!.deviceIdHash).toEqual(expect.any(String));
    expect(JSON.stringify(stored)).not.toContain(DEVICE);

    const other = await (await complete(token, [ticket!.uploadId], OTHER_DEVICE)).json();
    expect(other.results).toEqual([{ uploadId: ticket!.uploadId, status: 'UNKNOWN' }]);
    await cancelRoute(
      post(`/api/public/gallery/${token}/cancel`, { uploadIds: [ticket!.uploadId] }, OTHER_DEVICE),
      params(token),
    );
    expect(await db().collection('photo_uploads').countDocuments()).toBe(1);

    const mine = await (await complete(token, [ticket!.uploadId])).json();
    expect(mine.results[0].status).toBe('PUBLISHED');
  });

  it('a device gets 150 photos a day; a refused batch does not use up the rest', async () => {
    const { cookie } = await adminWithWedding();
    const token = await galleryToken(cookie);
    for (let i = 0; i < 4; i++) await guestUpload(token, 30);
    await guestUpload(token, 20); // 140 used

    const tooMany = await request(token, { photos: Array.from({ length: 30 }, declared) });
    expect(tooMany.status).toBe(429);
    expect((await tooMany.json()).error.details).toMatchObject({ remaining: 10 });
    expect(tooMany.headers.get('retry-after')).toMatch(/^\d+$/);

    await guestUpload(token, 10); // exactly 150
    expect((await request(token, { photos: [declared()] })).status).toBe(429);
    // Another phone at the same venue is unaffected.
    expect((await request(token, { photos: [declared()] }, OTHER_DEVICE)).status).toBe(200);
  });

  it('two batches at once from one phone: exactly the one that fits is taken', async () => {
    const { cookie } = await adminWithWedding();
    const token = await galleryToken(cookie);
    for (let i = 0; i < 4; i++) await guestUpload(token, 30); // 120 used, 30 left
    const batch = { photos: Array.from({ length: 30 }, declared) };
    const responses = await Promise.all([request(token, batch), request(token, batch)]);
    expect(responses.map((res) => res.status).sort()).toEqual([200, 429]);
    const refused = responses.find((res) => res.status === 429)!;
    expect((await refused.json()).error.details).toMatchObject({ remaining: 0 });
    expect((await request(token, { photos: [declared()] })).status).toBe(429);
  });

  it('the generous per-IP ceiling still stops one address at 2,000 a day', async () => {
    const { cookie } = await adminWithWedding();
    const token = await galleryToken(cookie);
    const ip = '203.0.113.7';
    await db()
      .collection('weddings')
      .updateOne({}, { $set: { 'counters.photoSlotsUsed': 0 } });
    // 14 phones × 140 photos = 1,960 from one venue address.
    for (let d = 0; d < 14; d++) {
      const device = `venue-device-${String(d).padStart(8, '0')}`;
      for (const n of [30, 30, 30, 30, 20]) {
        const res = await request(
          token,
          { photos: Array.from({ length: n }, declared) },
          device,
          ip,
        );
        expect(res.status).toBe(200);
      }
    }
    const venue = (n: number, device: string) =>
      request(token, { photos: Array.from({ length: n }, declared) }, device, ip);
    expect((await venue(30, 'venue-device-99999998')).status).toBe(200); // 1,990
    const last = await venue(30, 'venue-device-99999999');
    expect(last.status).toBe(429);
    expect((await last.json()).error.details).toMatchObject({ remaining: 10 });
  });

  it('uploads off: UPLOADS_DISABLED for request and complete; viewing still works', async () => {
    const { cookie } = await adminWithWedding();
    const token = await galleryToken(cookie);
    const [pending] = await guestUpload(token);
    await patchSettingsRoute(
      jsonRequest('PATCH', '/api/gallery/settings', { guestUploadEnabled: false }, cookie),
    );

    const req = await request(token, { photos: [declared()] });
    expect(req.status).toBe(409);
    expect((await req.json()).error.code).toBe('UPLOADS_DISABLED');
    const done = await complete(token, [pending!.uploadId]);
    expect((await done.json()).error.code).toBe('UPLOADS_DISABLED');
    // Cancel still releases the slot.
    await cancelRoute(
      post(`/api/public/gallery/${token}/cancel`, { uploadIds: [pending!.uploadId] }),
      params(token),
    );
    expect(await db().collection('photo_uploads').countDocuments()).toBe(0);

    const gallery = await (
      await galleryRoute(getRequest(`/api/public/gallery/${token}`), params(token))
    ).json();
    expect(gallery).toMatchObject({ viewEnabled: true, uploadEnabled: false });
    const list = await photosRoute(
      getRequest(`/api/public/gallery/${token}/photos`),
      params(token),
    );
    expect(list.status).toBe(200);
  });

  it('viewing off: the photo list is 409 CONFLICT, uploading still works', async () => {
    const { cookie } = await adminWithWedding();
    const token = await galleryToken(cookie);
    await patchSettingsRoute(
      jsonRequest('PATCH', '/api/gallery/settings', { guestViewEnabled: false }, cookie),
    );
    const list = await photosRoute(
      getRequest(`/api/public/gallery/${token}/photos`),
      params(token),
    );
    expect(list.status).toBe(409);
    expect((await list.json()).error).toMatchObject({
      code: 'CONFLICT',
      message: 'Viewing is turned off',
    });
    expect((await guestUpload(token)).length).toBe(1);
  });

  it("a guest cannot use another wedding's event or reach its photos", async () => {
    const asha = await adminWithWedding('Asha');
    const ravi = await adminWithWedding('Ravi');
    const ashaToken = await galleryToken(asha.cookie);
    const raviToken = await galleryToken(ravi.cookie);
    const eventRes = await createEventRoute(
      jsonRequest(
        'POST',
        '/api/events',
        { name: 'Haldi', type: 'HALDI', date: '2027-02-12' },
        asha.cookie,
      ),
    );
    const eventId = ((await eventRes.json()) as { id: string }).id;

    const res = await request(raviToken, { eventId, photos: [declared()] });
    expect(res.status).toBe(404);
    const uploads = await guestUpload(ashaToken, 1, { eventId });
    expect(
      (await (await complete(raviToken, [uploads[0]!.uploadId])).json()).results[0].status,
    ).toBe('UNKNOWN');
    const raviPhotos = await (
      await photosRoute(getRequest(`/api/public/gallery/${raviToken}/photos`), params(raviToken))
    ).json();
    expect(raviPhotos.items).toEqual([]);
  });

  it('guest-supplied names are limited; members cannot be impersonated by type', async () => {
    const { cookie } = await adminWithWedding();
    const token = await galleryToken(cookie);
    for (const body of [
      { uploaderName: 'x'.repeat(61), photos: [declared()] },
      { uploaderType: 'MEMBER', photos: [declared()] },
      { uploaderUserId: new Types.ObjectId().toHexString(), photos: [declared()] },
    ]) {
      expect((await request(token, body)).status).toBe(400);
    }
  });
});
