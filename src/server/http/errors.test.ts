import { describe, expect, it } from 'vitest';
import { AppError, errorResponse } from './errors';

describe('errorResponse', () => {
  it('renders an AppError as the API envelope with its HTTP status', async () => {
    const res = errorResponse(
      new AppError('LAST_ADMIN', 'A wedding needs at least one Admin.'),
      'req-1',
    );

    expect(res.status).toBe(409);
    expect(res.headers.get('X-Request-Id')).toBe('req-1');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({
      error: {
        code: 'LAST_ADMIN',
        message: 'A wedding needs at least one Admin.',
        requestId: 'req-1',
      },
    });
  });

  it('includes details only when present', async () => {
    const res = errorResponse(
      new AppError('GALLERY_FULL', 'Gallery is full.', { remaining: 3 }),
      'r',
    );
    expect((await res.json()).error.details).toEqual({ remaining: 3 });
  });

  it('never leaks the message of an unexpected error', async () => {
    const res = errorResponse(new Error('E11000 duplicate key { token: "abc" }'), 'req-2');
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('E11000');
  });
});
