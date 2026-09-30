import mongoose from 'mongoose';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as loginRoute } from '@/app/api/auth/login/route';
import { POST as logoutRoute } from '@/app/api/auth/logout/route';
import { POST as signupRoute } from '@/app/api/auth/signup/route';
import { GET as meRoute } from '@/app/api/me/route';
import { resolveSession } from '@/modules/auth';
import { hashToken } from '@/server/auth/tokens';
import { connectDb } from '@/server/db/connection';

/**
 * Auth security rules (API_DESIGN §2, §10, §30; DATABASE_DESIGN §5.1–§5.2), exercised through the
 * real route handlers against the in-memory replica set.
 */
const ORIGIN = process.env.APP_ORIGIN!;
let ipCounter = 0;

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      origin: ORIGIN,
      'content-type': 'application/json',
      // A fresh IP per request, so IP rate limits only apply where a test sets one.
      'x-real-ip': `10.0.0.${++ipCounter % 250}`,
      ...headers,
    },
  });
}

function get(path: string, cookie?: string): Request {
  return new Request(`${ORIGIN}${path}`, { headers: cookie ? { cookie } : {} });
}

/** The `sid=<token>` pair from a Set-Cookie header. */
function sidFrom(res: Response): string {
  const header = res.headers.get('set-cookie') ?? '';
  const match = /sid=([^;]*)/.exec(header);
  if (!match?.[1]) throw new Error('no session cookie');
  return `sid=${match[1]}`;
}

const asha = { name: 'Asha Rao', email: 'Asha@Example.com', password: 'mehndi-at-dusk-2026' };

async function signupAsha(): Promise<Response> {
  return signupRoute(post('/api/auth/signup', asha));
}

describe('auth security', () => {
  beforeEach(async () => {
    const conn = await connectDb();
    await Promise.all(
      ['users', 'sessions', 'rate_limits'].map((name) =>
        conn.connection.db!.dropCollection(name).catch(() => undefined),
      ),
    );
    await Promise.all(Object.values(conn.models).map((model) => model.createIndexes()));
  });

  afterAll(() => mongoose.disconnect());

  it('signup creates the user, sets a secure session cookie and returns MeResponse', async () => {
    const res = await signupAsha();
    expect(res.status).toBe(201);
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body).toEqual({
      user: { id: expect.any(String), name: 'Asha Rao', email: 'asha@example.com' },
    });
    expect(JSON.stringify(body)).not.toContain('password');
  });

  it('stores only a password hash and only the HMAC of the session token', async () => {
    const sid = sidFrom(await signupAsha());
    const db = mongoose.connection.db!;
    const user = await db.collection('users').findOne({ email: 'asha@example.com' });
    expect(user?.passwordHash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(user)).not.toContain(asha.password);

    const token = sid.slice('sid='.length);
    const session = await db.collection('sessions').findOne({});
    expect(session?.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(session)).not.toContain(token);
  });

  it('signup with an existing email (any case) returns EMAIL_TAKEN', async () => {
    await signupAsha();
    const res = await signupRoute(post('/api/auth/signup', { ...asha, email: 'ASHA@example.com' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('EMAIL_TAKEN');
  });

  it('signup rejects short and common passwords', async () => {
    for (const password of ['short', 'password123']) {
      const res = await signupRoute(post('/api/auth/signup', { ...asha, password }));
      expect(res.status).toBe(400);
      expect((await res.json()).error.details.fields.password).toBeTruthy();
    }
    expect(await mongoose.connection.db!.collection('users').countDocuments()).toBe(0);
  });

  it('a body with a server-owned field is rejected', async () => {
    const res = await signupRoute(
      post('/api/auth/signup', { ...asha, weddingId: 'x', role: 'ADMIN' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
  });

  it('mutations without Origin, or from another origin, return 403', async () => {
    const noOrigin = new Request(`${ORIGIN}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify(asha),
      headers: { 'content-type': 'application/json' },
    });
    expect((await loginRoute(noOrigin)).status).toBe(403);
    const foreign = post('/api/auth/signup', asha, { origin: 'https://evil.example' });
    expect((await signupRoute(foreign)).status).toBe(403);
    const logout = post('/api/auth/logout', {}, { origin: 'https://evil.example' });
    expect((await logoutRoute(logout)).status).toBe(403);
  });

  it('mutations with a non-JSON Content-Type return 400', async () => {
    const res = await loginRoute(
      post('/api/auth/login', asha, { 'content-type': 'application/x-www-form-urlencoded' }),
    );
    expect(res.status).toBe(400);
  });

  it('login returns the same error for an unknown email and a wrong password', async () => {
    await signupAsha();
    const unknown = await loginRoute(
      post('/api/auth/login', { email: 'nobody@example.com', password: asha.password }),
    );
    const wrong = await loginRoute(
      post('/api/auth/login', { email: asha.email, password: 'not-the-password' }),
    );
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    const a = (await unknown.json()).error;
    const b = (await wrong.json()).error;
    expect({ code: a.code, message: a.message }).toEqual({ code: b.code, message: b.message });
    expect(a.code).toBe('INVALID_CREDENTIALS');
  });

  it('login with the right password returns a working session', async () => {
    await signupAsha();
    const res = await loginRoute(
      post('/api/auth/login', { email: 'ASHA@example.com', password: asha.password }),
    );
    expect(res.status).toBe(200);
    const me = await meRoute(get('/api/me', sidFrom(res)));
    expect(me.status).toBe(200);
    expect((await me.json()).user.email).toBe('asha@example.com');
  });

  it('GET /api/me returns 401 without a session or with an unknown token', async () => {
    expect((await meRoute(get('/api/me'))).status).toBe(401);
    const res = await meRoute(get('/api/me', `sid=${'x'.repeat(43)}`));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHENTICATED');
  });

  it('logout deletes the session, so the cookie stops working', async () => {
    const sid = sidFrom(await signupAsha());
    const res = await logoutRoute(post('/api/auth/logout', {}, { cookie: sid }));
    expect(res.status).toBe(204);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await meRoute(get('/api/me', sid))).status).toBe(401);
  });

  it('an expired session is rejected even before TTL cleanup runs', async () => {
    const sid = sidFrom(await signupAsha());
    await mongoose.connection
      .db!.collection('sessions')
      .updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await meRoute(get('/api/me', sid))).status).toBe(401);
  });

  it('the session slides only when last seen over a day ago', async () => {
    const sid = sidFrom(await signupAsha());
    const token = sid.slice('sid='.length);
    const sessions = mongoose.connection.db!.collection('sessions');

    const fresh = await resolveSession(token);
    expect(fresh?.refreshed).toBe(false);

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await sessions.updateMany({}, { $set: { lastSeenAt: twoDaysAgo } });
    const res = await meRoute(get('/api/me', sid));
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=2592000');
    const after = await sessions.findOne({});
    expect(after!.lastSeenAt.getTime()).toBeGreaterThan(twoDaysAgo.getTime());
  });

  it('login is rate limited per email with 429 and Retry-After', async () => {
    await signupAsha();
    const attempt = () =>
      loginRoute(post('/api/auth/login', { email: asha.email, password: 'wrong-password-1' }));
    for (let i = 0; i < 10; i++) expect((await attempt()).status).toBe(401);
    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    // Even the right password is refused while limited.
    const right = await loginRoute(
      post('/api/auth/login', { email: asha.email, password: asha.password }),
    );
    expect(right.status).toBe(429);
  });

  it('signup is rate limited per IP', async () => {
    const ip = { 'x-real-ip': '203.0.113.9' };
    for (let i = 0; i < 10; i++) {
      const res = await signupRoute(
        post('/api/auth/signup', { ...asha, email: `u${i}@example.com` }, ip),
      );
      expect(res.status).toBe(201);
    }
    const res = await signupRoute(
      post('/api/auth/signup', { ...asha, email: 'u10@example.com' }, ip),
    );
    expect(res.status).toBe(429);
  });

  it('rate-limit keys are stored hashed, never as emails or IPs', async () => {
    await loginRoute(post('/api/auth/login', { email: asha.email, password: 'wrong-password-1' }));
    const docs = await mongoose.connection.db!.collection('rate_limits').find({}).toArray();
    expect(docs.length).toBeGreaterThan(0);
    expect(JSON.stringify(docs)).not.toMatch(/asha|10\.0\.0\./i);
  });
});
