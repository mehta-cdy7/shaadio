import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJson, NETWORK_ERROR, patchJson, postJson, retryAfterMinutes } from './api';

function stubFetch(impl: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

describe('postJson', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the body on success', async () => {
    stubFetch(async () => Response.json({ user: { id: '1' } }, { status: 200 }));
    expect(await postJson('/api/x', {})).toEqual({ ok: true, data: { user: { id: '1' } } });
  });

  it('returns code, details and requestId from the error envelope, never the message', async () => {
    stubFetch(async () =>
      Response.json(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'internal',
            details: { retryAfterSeconds: 60 },
            requestId: 'r1',
          },
        },
        { status: 429 },
      ),
    );
    const result = await postJson('/api/x', {});
    expect(result).toEqual({
      ok: false,
      code: 'RATE_LIMITED',
      details: { retryAfterSeconds: 60 },
      requestId: 'r1',
    });
  });

  it('falls back to INTERNAL_ERROR and the header request id for a non-JSON error', async () => {
    stubFetch(
      async () => new Response('<html>', { status: 502, headers: { 'X-Request-Id': 'h1' } }),
    );
    expect(await postJson('/api/x', {})).toEqual({
      ok: false,
      code: 'INTERNAL_ERROR',
      requestId: 'h1',
    });
  });

  it('treats a 2xx with a non-JSON body as INTERNAL_ERROR instead of throwing', async () => {
    stubFetch(
      async () => new Response('<html>', { status: 200, headers: { 'X-Request-Id': 'h2' } }),
    );
    expect(await postJson('/api/x', {})).toEqual({
      ok: false,
      code: 'INTERNAL_ERROR',
      requestId: 'h2',
    });
  });

  it('returns no data for 204', async () => {
    stubFetch(async () => new Response(null, { status: 204 }));
    expect(await postJson('/api/x', {})).toEqual({ ok: true, data: undefined });
  });

  it('reports a network failure', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await postJson('/api/x', {})).toEqual({ ok: false, code: NETWORK_ERROR });
  });
});

describe('retryAfterMinutes', () => {
  it('rounds up to whole minutes, at least 1', () => {
    expect(retryAfterMinutes({ retryAfterSeconds: 290 })).toBe(5);
    expect(retryAfterMinutes({ retryAfterSeconds: 1 })).toBe(1);
    expect(retryAfterMinutes(undefined)).toBe(1);
  });
});

describe('getJson', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends a same-origin GET without a body and parses like postJson', async () => {
    const fetchMock = vi.fn(async () => Response.json({ user: { id: '1' } }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await getJson('/api/me')).toEqual({ ok: true, data: { user: { id: '1' } } });
    expect(fetchMock).toHaveBeenCalledWith('/api/me', {
      method: 'GET',
      credentials: 'same-origin',
    });
  });
});

describe('patchJson', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends a same-origin JSON PATCH', async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: 'w' }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await patchJson('/api/wedding', { title: null })).toEqual({
      ok: true,
      data: { id: 'w' },
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/wedding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{"title":null}',
      credentials: 'same-origin',
    });
  });
});
