import { expect } from 'vitest';
import { POST as signupRoute } from '@/app/api/auth/signup/route';
import { POST as createWeddingRoute } from '@/app/api/wedding/route';
import { addDays, todayIn } from '@/lib/dates';

/**
 * Request builders for integration tests that call route handlers directly. Every mutation carries
 * the app Origin and a JSON content type, as the browser would (API_DESIGN §2.2).
 */
export const ORIGIN = process.env.APP_ORIGIN ?? 'http://localhost:3000';

let ipCounter = 0;
let userCounter = 0;

export function jsonRequest(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body: unknown,
  cookie?: string,
  headers: Record<string, string> = {},
): Request {
  return new Request(`${ORIGIN}${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      origin: ORIGIN,
      'content-type': 'application/json',
      // A fresh IP per request, so IP rate limits only apply where a test sets one.
      'x-real-ip': `10.9.${(++ipCounter >> 8) % 250}.${ipCounter % 250}`,
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
  });
}

export function getRequest(path: string, cookie?: string): Request {
  return new Request(`${ORIGIN}${path}`, { headers: cookie ? { cookie } : {} });
}

export function sidFrom(res: Response): string {
  const match = /sid=([^;]*)/.exec(res.headers.get('set-cookie') ?? '');
  if (!match?.[1]) throw new Error('no session cookie');
  return `sid=${match[1]}`;
}

/** Signs up a fresh user and returns their session cookie. */
export async function signUp(name = 'Priya Sharma'): Promise<string> {
  const res = await signupRoute(
    jsonRequest('POST', '/api/auth/signup', {
      name,
      email: `user${++userCounter}-${Date.now()}@example.com`,
      password: 'plum-and-brass-2026',
    }),
  );
  expect(res.status).toBe(201);
  return sidFrom(res);
}

/** Signs up a user who creates a wedding; returns their cookie, the wedding id and date. */
export async function adminWithWedding(name = 'Priya Sharma') {
  const cookie = await signUp(name);
  const weddingDate = addDays(todayIn('Asia/Kolkata'), 120);
  const res = await createWeddingRoute(
    jsonRequest(
      'POST',
      '/api/wedding',
      {
        brideName: 'Princi',
        groomName: 'Akshay',
        weddingDate,
        location: { formattedAddress: 'Dehradun', city: 'Dehradun' },
      },
      cookie,
    ),
  );
  expect(res.status).toBe(201);
  const wedding = (await res.json()) as { id: string };
  return { cookie, weddingId: wedding.id, weddingDate };
}
