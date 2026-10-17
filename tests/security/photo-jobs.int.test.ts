import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as cleanupRoute } from '@/app/api/internal/jobs/cleanup/route';
import { GET as retentionRoute } from '@/app/api/internal/jobs/retention/route';
import { GET as settingsRoute } from '@/app/api/gallery/settings/route';
import { POST as completeRoute } from '@/app/api/photos/complete/route';
import { POST as uploadRequestRoute } from '@/app/api/photos/upload-requests/route';
import { addDays, addYears, todayIn } from '@/lib/dates';
import { connectDb } from '@/server/db/connection';
import { adminWithWedding, getRequest, jsonRequest, ORIGIN } from '../factories/api';

/**
 * The daily photo jobs (API_DESIGN §27; DATABASE_DESIGN §14.6, §14.7) through their cron routes,
 * with R2 replaced by an in-memory bucket.
 */
process.env.MONGODB_URI = process.env.MONGODB_URI!.replace('/shaadio-test', '/shaadio-jobs');
const SECRET = 'cron-secret-for-photo-job-tests-0123456789';
process.env.CRON_SECRET = SECRET;

const bucket = vi.hoisted(() => new Map<string, Uint8Array>());
const r2 = vi.hoisted(() => ({ deletesFail: false }));

vi.mock('@/server/storage/storage', () => ({
  UPLOAD_URL_SECONDS: 3600,
  StorageNotConfiguredError: class extends Error {},
  storageConfigured: () => true,
  signUploadUrl: async (key: string) => `https://r2.test/${key}?signed`,
  headObject: async (key: string) => {
    const body = bucket.get(key);
    return body ? { size: body.length, contentType: 'image/jpeg' } : undefined;
  },
  readObjectStart: async (key: string, length = 16) => bucket.get(key)?.slice(0, length),
  copyObject: async (from: string, to: string) => {
    bucket.set(to, bucket.get(from)!);
  },
  deleteObjects: async (keys: string[]) => {
    if (r2.deletesFail) throw new Error('R2 unavailable');
    for (const key of keys) bucket.delete(key);
  },
  deletePrefix: async (prefix: string) => {
    let deleted = 0;
    for (const key of [...bucket.keys()]) {
      if (key.startsWith(prefix)) {
        bucket.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  },
  publicUrl: (key: string) => `https://media.test/${key}`,
  optionalPublicUrl: (key?: string | null) => (key ? `https://media.test/${key}` : undefined),
}));

const db = () => mongoose.connection.db!;
const jpeg = (length: number) => {
  const body = new Uint8Array(length);
  body.set([0xff, 0xd8, 0xff, 0xe0]);
  return body;
};
const declared = {
  mimeType: 'image/jpeg',
  displayBytes: 500,
  thumbBytes: 100,
  width: 800,
  height: 600,
};
const keyOf = (url: string) => decodeURIComponent(new URL(url).pathname.slice(1));

function cron(path: string, secret = SECRET) {
  return new Request(`${ORIGIN}${path}`, { headers: { authorization: `Bearer ${secret}` } });
}

async function tickets(cookie: string, count: number) {
  const res = await uploadRequestRoute(
    jsonRequest(
      'POST',
      '/api/photos/upload-requests',
      { photos: Array(count).fill(declared) },
      cookie,
    ),
  );
  return { status: res.status, body: await res.json() };
}

async function publish(cookie: string, count: number) {
  const { body } = await tickets(cookie, count);
  for (const ticket of body.uploads) {
    bucket.set(keyOf(ticket.displayPutUrl), jpeg(500));
    bucket.set(keyOf(ticket.thumbPutUrl), jpeg(100));
  }
  await completeRoute(
    jsonRequest(
      'POST',
      '/api/photos/complete',
      { uploadIds: body.uploads.map((u: { uploadId: string }) => u.uploadId) },
      cookie,
    ),
  );
}

async function wedding(id: string) {
  return db()
    .collection('weddings')
    .findOne({ _id: new Types.ObjectId(id) });
}

describe('photo jobs', () => {
  beforeAll(async () => {
    await connectDb();
  });

  beforeEach(async () => {
    bucket.clear();
    r2.deletesFail = false;
    await Promise.all(
      [
        'users',
        'sessions',
        'rate_limits',
        'weddings',
        'wedding_memberships',
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

  it('job routes refuse requests without the cron secret', async () => {
    for (const route of [cleanupRoute, retentionRoute]) {
      expect((await route(new Request(`${ORIGIN}/api/internal/jobs/x`))).status).toBe(401);
      expect((await route(cron('/api/internal/jobs/x', 'wrong-secret'))).status).toBe(401);
    }
  });

  it('cleanup releases expired reservations and their staging files, and only those', async () => {
    const asha = await adminWithWedding('Asha');
    const ravi = await adminWithWedding('Ravi');
    const old = await tickets(asha.cookie, 3);
    for (const ticket of old.body.uploads) bucket.set(keyOf(ticket.displayPutUrl), jpeg(500));
    await tickets(ravi.cookie, 2); // still within the hour
    await db()
      .collection('photo_uploads')
      .updateMany(
        { weddingId: new Types.ObjectId(asha.weddingId) },
        { $set: { expiresAt: new Date(Date.now() - 60_000) } },
      );

    const res = await cleanupRoute(cron('/api/internal/jobs/cleanup'));
    expect(await res.json()).toMatchObject({ processed: 3, remaining: 0 });
    expect((await wedding(asha.weddingId))!.counters.photoSlotsUsed).toBe(0);
    expect((await wedding(ravi.weddingId))!.counters.photoSlotsUsed).toBe(2);
    expect(await db().collection('photo_uploads').countDocuments()).toBe(2);
    expect(bucket.size).toBe(0);

    // Idempotent: nothing left to do.
    expect(await (await cleanupRoute(cron('/api/internal/jobs/cleanup'))).json()).toMatchObject({
      processed: 0,
      remaining: 0,
    });
  });

  it('if R2 cannot delete the staging files, the rows and slots stay for the next run', async () => {
    const { cookie, weddingId } = await adminWithWedding();
    const pending = await tickets(cookie, 2);
    for (const ticket of pending.body.uploads) bucket.set(keyOf(ticket.displayPutUrl), jpeg(500));
    await db()
      .collection('photo_uploads')
      .updateMany({}, { $set: { expiresAt: new Date(Date.now() - 60_000) } });

    r2.deletesFail = true;
    const failed = await (await cleanupRoute(cron('/api/internal/jobs/cleanup'))).json();
    expect(failed).toMatchObject({ processed: 0, remaining: 2 });
    expect((await wedding(weddingId))!.counters.photoSlotsUsed).toBe(2);
    expect(bucket.size).toBe(2);

    r2.deletesFail = false;
    const retried = await (await cleanupRoute(cron('/api/internal/jobs/cleanup'))).json();
    expect(retried).toMatchObject({ processed: 2, remaining: 0 });
    expect((await wedding(weddingId))!.counters.photoSlotsUsed).toBe(0);
    expect(bucket.size).toBe(0);
  });

  it('retention deletes photos 12 months after the wedding, keeps covers, and closes uploads', async () => {
    const past = await adminWithWedding('Asha');
    const recent = await adminWithWedding('Ravi');
    await publish(past.cookie, 2);
    await publish(recent.cookie, 1);
    const cover = `weddings/${past.weddingId}/covers/abc.webp`;
    bucket.set(cover, jpeg(10));

    const today = todayIn('Asia/Kolkata');
    await db()
      .collection('weddings')
      .updateOne(
        { _id: new Types.ObjectId(past.weddingId) },
        { $set: { weddingDate: addDays(addYears(today, -1), -1) } },
      );
    await db()
      .collection('weddings')
      .updateOne(
        { _id: new Types.ObjectId(recent.weddingId) },
        { $set: { weddingDate: addYears(today, -1) } }, // exactly 12 months: kept today
      );

    // Past the cutoff, members can no longer add photos.
    const blocked = await tickets(past.cookie, 1);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('UPLOADS_DISABLED');

    const res = await retentionRoute(cron('/api/internal/jobs/retention'));
    expect(await res.json()).toMatchObject({ processed: 1, remaining: 0 });

    const purged = await wedding(past.weddingId);
    expect(purged).toMatchObject({
      counters: { photoSlotsUsed: 0, featuredPhotoCount: 0 },
      gallery: { guestUploadEnabled: false },
    });
    expect(purged!.photosPurgedAt).toBeInstanceOf(Date);
    expect(
      await db()
        .collection('photos')
        .countDocuments({ weddingId: new Types.ObjectId(past.weddingId) }),
    ).toBe(0);
    expect(
      [...bucket.keys()].filter((k) => k.startsWith(`weddings/${past.weddingId}/photos/`)),
    ).toEqual([]);
    expect(bucket.has(cover)).toBe(true);
    expect(
      await db()
        .collection('photos')
        .countDocuments({ weddingId: new Types.ObjectId(recent.weddingId) }),
    ).toBe(1);

    const settings = await (
      await settingsRoute(getRequest('/api/gallery/settings', past.cookie))
    ).json();
    expect(settings.photosPurgedAt).toEqual(expect.any(String));
    expect(await (await retentionRoute(cron('/api/internal/jobs/retention'))).json()).toMatchObject(
      {
        processed: 0,
      },
    );
  });
});
