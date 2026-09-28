import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/db/connection', () => ({ pingDb: vi.fn() }));

const { pingDb } = await import('@/server/db/connection');
const { GET } = await import('./route');

describe('GET /api/health (database mocked)', () => {
  afterEach(() => vi.mocked(pingDb).mockReset());

  it('returns 503 when the database is down', async () => {
    vi.mocked(pingDb).mockResolvedValue(false);
    const res = await GET();

    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ status: 'degraded', db: 'down' });
  });
});
