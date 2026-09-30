import { z } from 'zod';
import { beforeAll, describe, expect, it } from 'vitest';
import { AppError } from './errors';
import { handler, readJson } from './route';

const ORIGIN = 'https://shaadioo.example';
const schema = z.strictObject({ name: z.string().min(1) });

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/x`, {
    method: 'POST',
    body,
    headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers },
  });
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof AppError ? error.code : 'not an AppError';
  }
}

describe('readJson', () => {
  beforeAll(() => {
    process.env.MONGODB_URI ??= 'mongodb://localhost:27017/unit';
    process.env.APP_ORIGIN = ORIGIN;
  });

  it('parses a valid same-origin JSON body', async () => {
    await expect(readJson(post('{"name":"Asha"}'), schema)).resolves.toEqual({ name: 'Asha' });
  });

  it('rejects a missing or foreign Origin with FORBIDDEN', async () => {
    expect(await codeOf(readJson(post('{}', { origin: 'https://evil.example' }), schema))).toBe(
      'FORBIDDEN',
    );
    const noOrigin = new Request(`${ORIGIN}/api/x`, {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    });
    expect(await codeOf(readJson(noOrigin, schema))).toBe('FORBIDDEN');
  });

  it('rejects a non-JSON content type', async () => {
    expect(await codeOf(readJson(post('name=a', { 'content-type': 'text/plain' }), schema))).toBe(
      'VALIDATION_ERROR',
    );
  });

  it('rejects malformed JSON, unknown fields and bodies over 64 KB', async () => {
    expect(await codeOf(readJson(post('{'), schema))).toBe('VALIDATION_ERROR');
    expect(await codeOf(readJson(post('{"name":"a","weddingId":"x"}'), schema))).toBe(
      'VALIDATION_ERROR',
    );
    const big = JSON.stringify({ name: 'x'.repeat(65 * 1024) });
    expect(await codeOf(readJson(post(big), schema))).toBe('PAYLOAD_TOO_LARGE');
  });

  it('reports invalid fields by path', async () => {
    const error = await readJson(post('{"name":""}'), schema).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).details).toEqual({ fields: { name: expect.any(String) } });
  });
});

describe('handler', () => {
  it('adds no-store and a request id, and maps errors to the envelope', async () => {
    const ok = await handler('/api/x', async () => Response.json({ ok: true }))(post('{}'));
    expect(ok.headers.get('Cache-Control')).toBe('no-store');
    expect(ok.headers.get('X-Request-Id')).toBeTruthy();

    const failed = await handler('/api/x', async () => {
      throw new AppError('RATE_LIMITED', 'Slow down.', { retryAfterSeconds: 7 });
    })(post('{}'));
    expect(failed.status).toBe(429);
    expect(failed.headers.get('Retry-After')).toBe('7');
    expect((await failed.json()).error.code).toBe('RATE_LIMITED');
  });
});
