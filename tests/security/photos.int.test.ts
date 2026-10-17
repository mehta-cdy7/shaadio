import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE as deleteEventRoute } from '@/app/api/events/[id]/route';
import { GET as previewRoute } from '@/app/api/events/[id]/delete-preview/route';
import { POST as createEventRoute } from '@/app/api/events/route';
import {
  GET as getSettingsRoute,
  PATCH as patchSettingsRoute,
} from '@/app/api/gallery/settings/route';
import { DELETE as deletePhotoRoute, PATCH as patchPhotoRoute } from '@/app/api/photos/[id]/route';
import { POST as cancelRoute } from '@/app/api/photos/cancel/route';
import { POST as completeRoute } from '@/app/api/photos/complete/route';
import { GET as listRoute } from '@/app/api/photos/route';
import { POST as uploadRequestRoute } from '@/app/api/photos/upload-requests/route';
import { POST as publishWebsiteRoute } from '@/app/api/website/publish/route';
import { GET as getWeddingRoute } from '@/app/api/wedding/route';
import { Photo } from '@/modules/gallery/photo.model';
import { findPublicWebsite } from '@/modules/weddings';
import { connectDb } from '@/server/db/connection';
import { UnscopedQueryError } from '@/server/db/tenant-guard';
import { adminWithWedding, getRequest, jsonRequest, signUp } from '../factories/api';

/**
 * Photos (API_DESIGN §21, §22; DATABASE_DESIGN §5.12, §5.13, §9.3, §9.4, §14.5) through the real
 * route handlers, with R2 replaced by an in-memory bucket. "The browser uploads" means writing
 * bytes to that bucket under the staging key the signed URL names.
 */
process.env.MONGODB_URI = process.env.MONGODB_URI!.replace('/shaadio-test', '/shaadio-photos');

const bucket = vi.hoisted(() => new Map<string, { body: Uint8Array; contentType?: string }>());

vi.mock('@/server/storage/storage', () => {
  const etag = (key: string) => `"${bucket.get(key)?.body.length}-${key.length}"`;
  return {
    UPLOAD_URL_SECONDS: 3600,
    StorageNotConfiguredError: class extends Error {},
    storageConfigured: () => true,
    signUploadUrl: async (key: string) => `https://r2.test/${key}?signed`,
    headObject: async (key: string) => {
      const object = bucket.get(key);
      return object
        ? { size: object.body.length, contentType: object.contentType, etag: etag(key) }
        : undefined;
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
  };
});

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const DISPLAY_BYTES = 2000;
const THUMB_BYTES = 300;

function declared(overrides: Record<string, unknown> = {}) {
  return {
    mimeType: 'image/jpeg',
    displayBytes: DISPLAY_BYTES,
    thumbBytes: THUMB_BYTES,
    width: 2560,
    height: 1707,
    ...overrides,
  };
}

function jpeg(length: number, header = JPEG): Uint8Array {
  const body = new Uint8Array(length);
  body.set(header);
  return body;
}

/** The staging key a signed URL points at. */
const keyOf = (url: string) => decodeURIComponent(new URL(url).pathname.slice(1));

type Ticket = { uploadId: string; displayPutUrl: string; thumbPutUrl: string };

async function requestUploads(cookie: string, body: unknown) {
  return uploadRequestRoute(jsonRequest('POST', '/api/photos/upload-requests', body, cookie));
}

async function tickets(cookie: string, count = 1, extra: Record<string, unknown> = {}) {
  const res = await requestUploads(cookie, {
    ...extra,
    photos: Array.from({ length: count }, () => declared()),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { uploads: Ticket[] }).uploads;
}

function putBoth(ticket: Ticket, display = jpeg(DISPLAY_BYTES), thumb = jpeg(THUMB_BYTES)) {
  bucket.set(keyOf(ticket.displayPutUrl), { body: display, contentType: 'image/jpeg' });
  bucket.set(keyOf(ticket.thumbPutUrl), { body: thumb, contentType: 'image/jpeg' });
}

async function complete(cookie: string, uploadIds: string[]) {
  const res = await completeRoute(
    jsonRequest('POST', '/api/photos/complete', { uploadIds }, cookie),
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as { results: Array<Record<string, unknown>> }).results;
}

/** Uploads and publishes `count` photos; returns their ids, oldest first. */
async function publish(cookie: string, count = 1, extra: Record<string, unknown> = {}) {
  const uploads = await tickets(cookie, count, extra);
  uploads.forEach((ticket) => putBoth(ticket));
  const results = await complete(
    cookie,
    uploads.map((u) => u.uploadId),
  );
  return results.map((r) => {
    expect(r.status).toBe('PUBLISHED');
    return (r.photo as { id: string }).id;
  });
}

const db = () => mongoose.connection.db!;

async function slotsUsed(weddingId: string): Promise<number> {
  const wedding = await db()
    .collection('weddings')
    .findOne({ _id: new Types.ObjectId(weddingId) });
  return wedding!.counters.photoSlotsUsed;
}

async function featuredCount(weddingId: string): Promise<number> {
  const wedding = await db()
    .collection('weddings')
    .findOne({ _id: new Types.ObjectId(weddingId) });
  return wedding!.counters.featuredPhotoCount;
}

async function setSlots(weddingId: string, used: number) {
  await db()
    .collection('weddings')
    .updateOne(
      { _id: new Types.ObjectId(weddingId) },
      { $set: { 'counters.photoSlotsUsed': used } },
    );
}

describe('photos security', () => {
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
        'guests',
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

  it('requires a session and a wedding', async () => {
    expect((await listRoute(getRequest('/api/photos'))).status).toBe(401);
    expect((await requestUploads('', { photos: [declared()] })).status).toBe(401);
    const res = await listRoute(getRequest('/api/photos', await signUp()));
    expect((await res.json()).error.code).toBe('NO_WEDDING');
  });

  it('uploads, verifies and publishes; the slot carries over exactly once', async () => {
    const { cookie, weddingId } = await adminWithWedding('Asha Verma');
    const uploads = await tickets(cookie, 2);
    expect(await slotsUsed(weddingId)).toBe(2);
    expect(await db().collection('photo_uploads').countDocuments()).toBe(2);
    for (const ticket of uploads) {
      expect(keyOf(ticket.displayPutUrl)).toMatch(
        new RegExp(`^staging/${weddingId}/[\\w-]{22}/d$`),
      );
      putBoth(ticket);
    }

    const ids = uploads.map((u) => u.uploadId);
    const results = await complete(cookie, ids);
    expect(results.map((r) => r.status)).toEqual(['PUBLISHED', 'PUBLISHED']);
    const photo = results[0]!.photo as Record<string, string>;
    expect(photo).toMatchObject({ uploaderType: 'MEMBER', uploaderName: 'Asha Verma' });
    expect(photo.displayUrl).toMatch(
      new RegExp(`^https://media\\.test/weddings/${weddingId}/photos/[\\w-]{22}/d\\.webp$`),
    );
    expect(await slotsUsed(weddingId)).toBe(2);
    expect(await db().collection('photo_uploads').countDocuments()).toBe(0);
    expect([...bucket.keys()].filter((key) => key.startsWith('staging/'))).toEqual([]);

    // A retried complete (lost response) publishes nothing twice.
    expect((await complete(cookie, ids)).map((r) => r.status)).toEqual(['UNKNOWN', 'UNKNOWN']);
    expect(await db().collection('photos').countDocuments()).toBe(2);

    const list = await (await listRoute(getRequest('/api/photos', cookie))).json();
    expect(list.items).toHaveLength(2);
    // Storage keys never leave the server; only URLs do.
    expect(JSON.stringify(list)).not.toMatch(/displayKey|thumbKey|staging/);
  });

  it('checks the stored bytes, not the declaration, and releases the slot of a failure', async () => {
    const { cookie, weddingId } = await adminWithWedding();
    const [missing, short, svg, ok] = await tickets(cookie, 4);
    putBoth(short!, jpeg(DISPLAY_BYTES - 1));
    putBoth(svg!, jpeg(DISPLAY_BYTES, [0x3c, 0x73, 0x76, 0x67]));
    putBoth(ok!);

    const results = await complete(
      cookie,
      [missing, short, svg, ok].map((t) => t!.uploadId),
    );
    expect(results.map((r) => r.reason ?? r.status)).toEqual([
      'MISSING_OBJECT',
      'TOO_LARGE',
      'NOT_AN_IMAGE',
      'PUBLISHED',
    ]);
    expect(await slotsUsed(weddingId)).toBe(1);
    expect(await db().collection('photo_uploads').countDocuments()).toBe(0);
    expect([...bucket.keys()].filter((key) => key.startsWith('staging/'))).toEqual([]);
  });

  it('an expired reservation fails as EXPIRED and frees its slot', async () => {
    const { cookie, weddingId } = await adminWithWedding();
    const [ticket] = await tickets(cookie);
    putBoth(ticket!);
    await db()
      .collection('photo_uploads')
      .updateOne({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const [result] = await complete(cookie, [ticket!.uploadId]);
    expect(result).toMatchObject({ status: 'FAILED', reason: 'EXPIRED' });
    expect(await slotsUsed(weddingId)).toBe(0);
  });

  it('rejects bad declarations before reserving anything', async () => {
    const { cookie, weddingId } = await adminWithWedding();
    for (const photos of [
      [],
      Array.from({ length: 31 }, () => declared()),
      [declared({ mimeType: 'image/heic' })],
      [declared({ mimeType: 'video/mp4' })],
      [declared({ displayBytes: 4 * 1024 * 1024 + 1 })],
      [declared({ thumbBytes: 300 * 1024 + 1 })],
      [declared({ width: 4000 })],
      [{ ...declared(), uploaderName: 'Someone else' }],
    ]) {
      expect((await requestUploads(cookie, { photos })).status).toBe(400);
    }
    expect((await requestUploads(cookie, { photos: [declared()], uploaderName: 'x' })).status).toBe(
      400,
    );
    expect(await slotsUsed(weddingId)).toBe(0);
  });

  it('stops at 2,000 with GALLERY_FULL and never overshoots under concurrency', async () => {
    const { cookie, weddingId } = await adminWithWedding();
    await setSlots(weddingId, 1995);
    const full = await requestUploads(cookie, {
      photos: Array.from({ length: 6 }, () => declared()),
    });
    expect(full.status).toBe(409);
    expect((await full.json()).error).toMatchObject({
      code: 'GALLERY_FULL',
      details: { remaining: 5 },
    });
    expect(await slotsUsed(weddingId)).toBe(1995);

    await setSlots(weddingId, 1990);
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        requestUploads(cookie, { photos: Array.from({ length: 3 }, () => declared()) }),
      ),
    );
    const accepted = responses.filter((res) => res.status === 200).length;
    expect(accepted).toBe(3);
    expect(await slotsUsed(weddingId)).toBe(1999);
  });

  it('cancel releases the slots of abandoned uploads, once', async () => {
    const { cookie, weddingId } = await adminWithWedding();
    const uploads = await tickets(cookie, 3);
    putBoth(uploads[0]!);
    const body = { uploadIds: uploads.map((u) => u.uploadId) };
    const cancel = () => cancelRoute(jsonRequest('POST', '/api/photos/cancel', body, cookie));
    expect((await cancel()).status).toBe(204);
    expect((await cancel()).status).toBe(204);
    expect(await slotsUsed(weddingId)).toBe(0);
    expect(bucket.size).toBe(0);
  });

  it("another wedding's uploads and photos are unknown or 404, and stay unchanged", async () => {
    const asha = await adminWithWedding('Asha');
    const ravi = await adminWithWedding('Ravi');
    const [photoId] = await publish(asha.cookie);
    const [pending] = await tickets(asha.cookie);
    putBoth(pending!);
    const before = await db().collection('photos').findOne({});

    expect(await complete(ravi.cookie, [pending!.uploadId])).toEqual([
      { uploadId: pending!.uploadId, status: 'UNKNOWN' },
    ]);
    await cancelRoute(
      jsonRequest('POST', '/api/photos/cancel', { uploadIds: [pending!.uploadId] }, ravi.cookie),
    );
    expect(await db().collection('photo_uploads').countDocuments()).toBe(1);
    expect(await slotsUsed(asha.weddingId)).toBe(2);
    expect(await slotsUsed(ravi.weddingId)).toBe(0);

    for (const res of [
      await patchPhotoRoute(
        jsonRequest('PATCH', `/api/photos/${photoId}`, { featured: true }, ravi.cookie),
        params(photoId!),
      ),
      await deletePhotoRoute(
        jsonRequest('DELETE', `/api/photos/${photoId}`, undefined, ravi.cookie),
        params(photoId!),
      ),
    ]) {
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe('NOT_FOUND');
    }
    expect(await db().collection('photos').findOne({})).toEqual(before);
    expect((await (await listRoute(getRequest('/api/photos', ravi.cookie))).json()).items).toEqual(
      [],
    );

    // Another wedding's event cannot be used as an album, on upload or on move.
    const eventRes = await createEventRoute(
      jsonRequest(
        'POST',
        '/api/events',
        { name: 'Haldi', type: 'HALDI', date: '2027-02-12' },
        asha.cookie,
      ),
    );
    const eventId = ((await eventRes.json()) as { id: string }).id;
    const upload = await requestUploads(ravi.cookie, { eventId, photos: [declared()] });
    expect(upload.status).toBe(404);
    expect((await upload.json()).error.details).toEqual({ field: 'eventId' });
    expect(await slotsUsed(ravi.weddingId)).toBe(0);
    const [raviPhoto] = await publish(ravi.cookie);
    const move = await patchPhotoRoute(
      jsonRequest('PATCH', `/api/photos/${raviPhoto}`, { eventId }, ravi.cookie),
      params(raviPhoto!),
    );
    expect(move.status).toBe(404);
  });

  it('features at most 12 photos; repeats and unfeatures keep the counter exact', async () => {
    const { cookie, weddingId } = await adminWithWedding();
    const ids = await publish(cookie, 13);
    const feature = (id: string, featured: boolean) =>
      patchPhotoRoute(jsonRequest('PATCH', `/api/photos/${id}`, { featured }, cookie), params(id));

    for (const id of ids.slice(0, 12)) expect((await feature(id, true)).status).toBe(200);
    expect((await feature(ids[0]!, true)).status).toBe(200);
    expect(await featuredCount(weddingId)).toBe(12);

    const thirteenth = await feature(ids[12]!, true);
    expect(thirteenth.status).toBe(409);
    expect((await thirteenth.json()).error.code).toBe('FEATURED_LIMIT');
    expect(await db().collection('photos').countDocuments({ featured: true })).toBe(12);

    expect((await (await feature(ids[0]!, false)).json()).featured).toBe(false);
    expect((await feature(ids[0]!, false)).status).toBe(200);
    expect(await featuredCount(weddingId)).toBe(11);
    expect((await feature(ids[12]!, true)).status).toBe(200);

    const featured = await (
      await listRoute(getRequest('/api/photos?featured=true', cookie))
    ).json();
    expect(featured.items).toHaveLength(12);
  });

  it('deleting a photo frees its slot and featured place, logs it and removes its files', async () => {
    const { cookie, weddingId } = await adminWithWedding('Asha');
    const [id] = await publish(cookie);
    await patchPhotoRoute(
      jsonRequest('PATCH', `/api/photos/${id}`, { featured: true }, cookie),
      params(id!),
    );
    expect(bucket.size).toBe(2);

    const res = await deletePhotoRoute(
      jsonRequest('DELETE', `/api/photos/${id}`, undefined, cookie),
      params(id!),
    );
    expect(res.status).toBe(204);
    expect(await slotsUsed(weddingId)).toBe(0);
    expect(await featuredCount(weddingId)).toBe(0);
    expect(bucket.size).toBe(0);
    const log = await db().collection('activity_logs').findOne({ action: 'photo.deleted' });
    expect(log).toMatchObject({ actor: { name: 'Asha' }, target: { type: 'photo' } });

    const again = await deletePhotoRoute(
      jsonRequest('DELETE', `/api/photos/${id}`, undefined, cookie),
      params(id!),
    );
    expect(again.status).toBe(404);
    expect(await slotsUsed(weddingId)).toBe(0);
  });

  it('a DELETE without the app Origin is refused', async () => {
    const { cookie } = await adminWithWedding();
    const [id] = await publish(cookie);
    const res = await deletePhotoRoute(
      new Request(`http://localhost:3000/api/photos/${id}`, {
        method: 'DELETE',
        headers: { cookie, origin: 'https://evil.example' },
      }),
      params(id!),
    );
    expect(res.status).toBe(403);
    expect(await db().collection('photos').countDocuments()).toBe(1);
  });

  it('albums: by event and "Other"; deleting the event moves its photos to "Other"', async () => {
    const { cookie } = await adminWithWedding();
    const eventRes = await createEventRoute(
      jsonRequest(
        'POST',
        '/api/events',
        { name: 'Haldi', type: 'HALDI', date: '2027-02-12' },
        cookie,
      ),
    );
    const eventId = ((await eventRes.json()) as { id: string }).id;
    await publish(cookie, 2, { eventId });
    await publish(cookie, 1);

    const album = async (query: string) =>
      (await (await listRoute(getRequest(`/api/photos?${query}`, cookie))).json()).items.length;
    expect(await album(`eventId=${eventId}`)).toBe(2);
    expect(await album('eventId=none')).toBe(1);

    const preview = await previewRoute(
      getRequest(`/api/events/${eventId}/delete-preview`, cookie),
      params(eventId),
    );
    expect((await preview.json()).photos).toBe(2);

    await deleteEventRoute(
      jsonRequest('DELETE', `/api/events/${eventId}`, undefined, cookie),
      params(eventId),
    );
    expect(await album('eventId=none')).toBe(3);
    expect(
      await db()
        .collection('photos')
        .countDocuments({ eventId: { $exists: true } }),
    ).toBe(0);
  });

  it('pages newest first with a cursor that only continues the same filter', async () => {
    const { cookie } = await adminWithWedding();
    await publish(cookie, 5);
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({ limit: '2', ...(cursor ? { cursor } : {}) });
      const page = await (await listRoute(getRequest(`/api/photos?${query}`, cookie))).json();
      seen.push(...page.items.map((p: { id: string }) => p.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);

    const first = await (await listRoute(getRequest('/api/photos?limit=2', cookie))).json();
    const other = await listRoute(
      getRequest(`/api/photos?featured=true&cursor=${first.nextCursor}`, cookie),
    );
    expect(other.status).toBe(400);
  });

  it('gallery settings: switches, storage used, and the token only in the gallery link', async () => {
    const { cookie } = await adminWithWedding();
    await publish(cookie, 2);
    const settings = await (
      await getSettingsRoute(getRequest('/api/gallery/settings', cookie))
    ).json();
    expect(settings).toMatchObject({
      guestViewEnabled: true,
      guestUploadEnabled: true,
      photosUsed: 2,
      photoLimit: 2000,
    });
    expect(settings.galleryUrl).toMatch(/^http:\/\/localhost:3000\/gallery\/[\w-]+$/);

    const patched = await patchSettingsRoute(
      jsonRequest('PATCH', '/api/gallery/settings', { guestUploadEnabled: false }, cookie),
    );
    expect(await patched.json()).toMatchObject({
      guestViewEnabled: true,
      guestUploadEnabled: false,
    });
    for (const body of [{}, { guestViewEnabled: 'yes' }, { photosUsed: 0 }]) {
      const res = await patchSettingsRoute(
        jsonRequest('PATCH', '/api/gallery/settings', body, cookie),
      );
      expect(res.status).toBe(400);
    }

    const token = settings.galleryUrl.split('/').pop();
    const wedding = await (await getWeddingRoute(getRequest('/api/wedding', cookie))).text();
    expect(wedding).not.toContain(token);
    expect(JSON.parse(wedding).isEmpty).toBe(false);
  });

  it('only featured photos reach the published website, newest featured first', async () => {
    const { cookie } = await adminWithWedding();
    const [a, b, c] = await publish(cookie, 3);
    for (const id of [a!, c!]) {
      await patchPhotoRoute(
        jsonRequest('PATCH', `/api/photos/${id}`, { featured: true }, cookie),
        params(id),
      );
    }
    const website = await (
      await publishWebsiteRoute(jsonRequest('POST', '/api/website/publish', {}, cookie))
    ).json();
    const site = await findPublicWebsite(website.url.split('/').pop());
    expect(site!.glimpse).toHaveLength(2);
    const stored = await db()
      .collection('photos')
      .find({ _id: { $in: [a, c].map((id) => new Types.ObjectId(id)) } })
      .toArray();
    const thumbOf = (id: string) =>
      `https://media.test/${stored.find((doc) => doc._id.toHexString() === id)!.thumbKey}`;
    expect(site!.glimpse.map((photo) => photo.thumbUrl)).toEqual([thumbOf(c!), thumbOf(a!)]);
    expect(JSON.stringify(site)).not.toContain(b!);
  });

  it('the tenant guard refuses unscoped photo queries', async () => {
    await expect(Photo.findById(new Types.ObjectId())).rejects.toBeInstanceOf(UnscopedQueryError);
  });
});
