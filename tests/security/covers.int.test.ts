import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as completeRoute } from '@/app/api/covers/complete/route';
import { DELETE as deleteRoute } from '@/app/api/covers/route';
import { POST as requestRoute } from '@/app/api/covers/upload-request/route';
import { DELETE as deleteEventRoute, GET as getEventRoute } from '@/app/api/events/[id]/route';
import { POST as createEventRoute } from '@/app/api/events/route';
import { GET as getWeddingRoute } from '@/app/api/wedding/route';
import { connectDb } from '@/server/db/connection';
import { adminWithWedding, getRequest, jsonRequest, ORIGIN } from '../factories/api';

/**
 * Cover images (API_DESIGN §23) through the real route handlers, with R2 replaced by an in-memory
 * bucket. The signed ticket stands in for a database row, so it must bind the wedding.
 */
process.env.MONGODB_URI = process.env.MONGODB_URI!.replace('/shaadio-test', '/shaadio-covers');

const bucket = vi.hoisted(() => new Map<string, Uint8Array>());

vi.mock('@/server/storage/storage', () => ({
  UPLOAD_URL_SECONDS: 3600,
  StorageNotConfiguredError: class extends Error {},
  storageConfigured: () => true,
  signUploadUrl: async (key: string) => `https://r2.test/${key}?signed`,
  headObject: async (key: string) => {
    const body = bucket.get(key);
    return body ? { size: body.length, contentType: 'image/webp' } : undefined;
  },
  readObjectStart: async (key: string, length = 16) => bucket.get(key)?.slice(0, length),
  copyObject: async (from: string, to: string) => {
    bucket.set(to, bucket.get(from)!);
  },
  deleteObjects: async (keys: string[]) => {
    for (const key of keys) bucket.delete(key);
  },
  deletePrefix: async () => 0,
  publicUrl: (key: string) => `https://media.test/${key}`,
  optionalPublicUrl: (key?: string | null) => (key ? `https://media.test/${key}` : undefined),
}));

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const db = () => mongoose.connection.db!;
const BYTES = 1500;

function webp(length = BYTES): Uint8Array {
  const body = new Uint8Array(length);
  body.set(new TextEncoder().encode('RIFF\x00\x00\x00\x00WEBP'));
  return body;
}

const keyOf = (url: string) => decodeURIComponent(new URL(url).pathname.slice(1));

async function requestCover(cookie: string, extra: Record<string, unknown> = {}) {
  return requestRoute(
    jsonRequest(
      'POST',
      '/api/covers/upload-request',
      {
        target: 'WEDDING',
        mimeType: 'image/webp',
        bytes: BYTES,
        width: 2560,
        height: 1440,
        ...extra,
      },
      cookie,
    ),
  );
}

async function upload(cookie: string, extra: Record<string, unknown> = {}, body = webp()) {
  const res = await requestCover(cookie, extra);
  expect(res.status).toBe(200);
  const { ticket, putUrl } = (await res.json()) as { ticket: string; putUrl: string };
  bucket.set(keyOf(putUrl), body);
  return ticket;
}

async function complete(cookie: string, ticket: string) {
  return completeRoute(jsonRequest('POST', '/api/covers/complete', { ticket }, cookie));
}

async function createEvent(cookie: string): Promise<string> {
  const res = await createEventRoute(
    jsonRequest(
      'POST',
      '/api/events',
      { name: 'Haldi', type: 'HALDI', date: '2027-02-12' },
      cookie,
    ),
  );
  return ((await res.json()) as { id: string }).id;
}

const covers = () => [...bucket.keys()].filter((key) => key.includes('/covers/'));

describe('cover images', () => {
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

  it('sets, replaces and removes the wedding cover, deleting old files', async () => {
    const { cookie, weddingId } = await adminWithWedding();
    const first = await complete(cookie, await upload(cookie));
    expect(first.status).toBe(200);
    const wedding = await first.json();
    expect(wedding.coverImageUrl).toMatch(
      new RegExp(`^https://media\\.test/weddings/${weddingId}/covers/[\\w-]{22}\\.webp$`),
    );
    expect(covers()).toHaveLength(1);
    expect([...bucket.keys()].filter((k) => k.startsWith('staging/'))).toEqual([]);

    const second = await (await complete(cookie, await upload(cookie))).json();
    expect(second.coverImageUrl).not.toBe(wedding.coverImageUrl);
    expect(covers()).toEqual([keyOf(second.coverImageUrl)]);

    const res = await deleteRoute(
      new Request(`${ORIGIN}/api/covers?target=WEDDING`, {
        method: 'DELETE',
        headers: { cookie, origin: ORIGIN },
      }),
    );
    expect(res.status).toBe(204);
    expect(covers()).toEqual([]);
    expect(
      await (await getWeddingRoute(getRequest('/api/wedding', cookie))).json(),
    ).not.toHaveProperty('coverImageUrl');
  });

  it('an event cover is set on the event and removed with it', async () => {
    const { cookie } = await adminWithWedding();
    const eventId = await createEvent(cookie);
    const res = await complete(cookie, await upload(cookie, { target: 'EVENT', eventId }));
    expect((await res.json()).coverImageUrl).toMatch(/\/covers\//);
    const event = await (
      await getEventRoute(getRequest(`/api/events/${eventId}`, cookie), params(eventId))
    ).json();
    expect(event.coverImageUrl).toMatch(/\/covers\//);

    await deleteEventRoute(
      jsonRequest('DELETE', `/api/events/${eventId}`, undefined, cookie),
      params(eventId),
    );
    expect(covers()).toEqual([]);
  });

  it("a ticket only works for its own wedding, and can't be forged or reused", async () => {
    const asha = await adminWithWedding('Asha');
    const ravi = await adminWithWedding('Ravi');
    const ticket = await upload(asha.cookie);

    const stolen = await complete(ravi.cookie, ticket);
    expect(stolen.status).toBe(400);
    expect((await stolen.json()).error.details).toEqual({ fields: { ticket: 'INVALID' } });

    const [body] = ticket.split('.');
    const forged = await complete(asha.cookie, `${body}.AAAA`);
    expect(forged.status).toBe(400);

    expect((await complete(asha.cookie, ticket)).status).toBe(200);
    // The staging file is gone once used: a replay finds nothing.
    const replay = await complete(asha.cookie, ticket);
    expect((await replay.json()).error.details).toEqual({ fields: { ticket: 'MISSING_OBJECT' } });
    const ashaWedding = await (
      await getWeddingRoute(getRequest('/api/wedding', asha.cookie))
    ).json();
    expect(ashaWedding.coverImageUrl).toMatch(/\/covers\//);
    const raviWedding = await (
      await getWeddingRoute(getRequest('/api/wedding', ravi.cookie))
    ).json();
    expect(raviWedding).not.toHaveProperty('coverImageUrl');
  });

  it('checks the stored bytes: size and format', async () => {
    const { cookie } = await adminWithWedding();
    const short = await complete(cookie, await upload(cookie, {}, webp(BYTES - 1)));
    expect((await short.json()).error.details).toEqual({ fields: { ticket: 'TOO_LARGE' } });
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'.padEnd(BYTES));
    const notImage = await complete(cookie, await upload(cookie, {}, svg));
    expect((await notImage.json()).error.details).toEqual({ fields: { ticket: 'NOT_AN_IMAGE' } });
    expect(covers()).toEqual([]);
    expect(bucket.size).toBe(0);
  });

  it('validates the target and refuses other weddings’ events', async () => {
    const asha = await adminWithWedding('Asha');
    const ravi = await adminWithWedding('Ravi');
    const eventId = await createEvent(asha.cookie);
    expect((await requestCover(asha.cookie, { target: 'EVENT' })).status).toBe(400);
    expect((await requestCover(asha.cookie, { eventId })).status).toBe(400);
    expect((await requestCover(asha.cookie, { bytes: 5 * 1024 * 1024 })).status).toBe(400);
    expect((await requestCover(asha.cookie, { mimeType: 'image/svg+xml' })).status).toBe(400);
    expect((await requestCover(ravi.cookie, { target: 'EVENT', eventId })).status).toBe(404);
    const removeOther = await deleteRoute(
      new Request(`${ORIGIN}/api/covers?target=EVENT&eventId=${eventId}`, {
        method: 'DELETE',
        headers: { cookie: ravi.cookie, origin: ORIGIN },
      }),
    );
    expect(removeOther.status).toBe(404);
  });
});
