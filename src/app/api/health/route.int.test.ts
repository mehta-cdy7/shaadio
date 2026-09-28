import mongoose from 'mongoose';
import { afterAll, describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /api/health (real MongoDB)', () => {
  afterAll(() => mongoose.disconnect());

  it('returns 200 with the database up', async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(await res.json()).toEqual({ status: 'ok', db: 'up' });
  });
});
