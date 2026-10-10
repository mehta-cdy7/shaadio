import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as signupRoute } from '@/app/api/auth/signup/route';
import { POST as resendRoute } from '@/app/api/member-invitations/[id]/resend/route';
import { POST as revokeRoute } from '@/app/api/member-invitations/[id]/revoke/route';
import { POST as acceptRoute } from '@/app/api/member-invitations/accept/route';
import {
  GET as listInvitationsRoute,
  POST as inviteRoute,
} from '@/app/api/member-invitations/route';
import { DELETE as removeRoute, PATCH as patchRoute } from '@/app/api/members/[userId]/route';
import { GET as listMembersRoute } from '@/app/api/members/route';
import { GET as previewRoute } from '@/app/api/public/member-invitations/[token]/route';
import { POST as createGuestRoute } from '@/app/api/guests/route';
import { connectDb } from '@/server/db/connection';
import { adminWithWedding, getRequest, jsonRequest, sidFrom, signUp } from '../factories/api';

/**
 * Wedding members and member invitations (PRD §9.4, API_DESIGN §12, §26, DATABASE_DESIGN §5.5,
 * §5.6, §9.2) through the real route handlers on the in-memory replica set. Own database.
 */
process.env.MONGODB_URI = process.env.MONGODB_URI!.replace('/shaadioo-test', '/shaadioo-members');

const PASSWORD = 'plum-and-brass-2026';
let emailCounter = 0;

type Sent = {
  id: string;
  email: string;
  role: string;
  status: string;
  joinUrl: string;
  emailSent: boolean;
};
type Member = { userId: string; name: string; email: string; role: string; label?: string };

const db = () => mongoose.connection.db!;
const tokenOf = (sent: Sent) => sent.joinUrl.split('/join/')[1]!;
const freshEmail = (name = 'meera') => `${name}${++emailCounter}-${Date.now()}@example.com`;
const params = <K extends string>(key: K, value: string) =>
  ({ params: Promise.resolve({ [key]: value }) }) as { params: Promise<Record<K, string>> };

/** Signs up with a known email; returns the cookie and the user's id. */
async function account(name: string, email = freshEmail()) {
  const res = await signupRoute(
    jsonRequest('POST', '/api/auth/signup', { name, email, password: PASSWORD }),
  );
  expect(res.status).toBe(201);
  const me = (await res.json()) as { user: { id: string } };
  return { cookie: sidFrom(res), email, userId: me.user.id };
}

function invite(cookie: string | undefined, body: unknown) {
  return inviteRoute(jsonRequest('POST', '/api/member-invitations', body, cookie));
}

async function invited(cookie: string, email: string, role = 'MANAGER', label?: string) {
  const res = await invite(cookie, { email, role, ...(label ? { label } : {}) });
  expect(res.status).toBe(201);
  return (await res.json()) as Sent;
}

function accept(cookie: string | undefined, token: string) {
  return acceptRoute(jsonRequest('POST', '/api/member-invitations/accept', { token }, cookie));
}

function preview(token: string) {
  return previewRoute(
    getRequest(`/api/public/member-invitations/${token}`),
    params('token', token),
  );
}

function patch(cookie: string, userId: string, body: unknown) {
  return patchRoute(
    jsonRequest('PATCH', `/api/members/${userId}`, body, cookie),
    params('userId', userId),
  );
}

function remove(cookie: string, userId: string) {
  return removeRoute(
    jsonRequest('DELETE', `/api/members/${userId}`, undefined, cookie),
    params('userId', userId),
  );
}

function resend(cookie: string, id: string) {
  return resendRoute(
    jsonRequest('POST', `/api/member-invitations/${id}/resend`, {}, cookie),
    params('id', id),
  );
}

function revoke(cookie: string, id: string) {
  return revokeRoute(
    jsonRequest('POST', `/api/member-invitations/${id}/revoke`, {}, cookie),
    params('id', id),
  );
}

async function members(cookie: string): Promise<Member[]> {
  const res = await listMembersRoute(getRequest('/api/members', cookie));
  expect(res.status).toBe(200);
  return ((await res.json()) as { items: Member[] }).items;
}

async function adminCount(weddingId: string): Promise<number> {
  const wedding = await db()
    .collection('weddings')
    .findOne({ _id: new Types.ObjectId(weddingId) });
  return wedding!.counters.adminCount as number;
}

/** An admin's wedding plus a second member who joined by invitation. */
async function weddingWithMember(role: 'ADMIN' | 'MANAGER' = 'MANAGER') {
  const admin = await adminWithWedding();
  const joiner = await account('Meera Kapoor');
  const sent = await invited(admin.cookie, joiner.email, role);
  expect((await accept(joiner.cookie, tokenOf(sent))).status).toBe(200);
  return { admin, joiner };
}

async function errorCode(res: Response): Promise<string> {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

describe('members security', () => {
  beforeAll(async () => {
    await connectDb();
  });

  beforeEach(async () => {
    await Promise.all(
      [
        'users',
        'sessions',
        'rate_limits',
        'weddings',
        'wedding_memberships',
        'member_invitations',
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

  it('requires a session and a wedding', async () => {
    expect((await listMembersRoute(getRequest('/api/members'))).status).toBe(401);
    expect((await invite(undefined, { email: 'a@example.com', role: 'MANAGER' })).status).toBe(401);
    const res = await listMembersRoute(getRequest('/api/members', await signUp('Ravi')));
    expect(await errorCode(res)).toBe('NO_WEDDING');
  });

  it('creates a pending invitation, stores only the token hash and logs it', async () => {
    const { cookie } = await adminWithWedding();
    const email = freshEmail();
    const sent = await invited(cookie, email.toUpperCase(), 'MANAGER', "Bride's Cousin");
    expect(sent).toMatchObject({ email, role: 'MANAGER', status: 'PENDING', emailSent: false });
    expect(sent.joinUrl).toMatch(/\/join\/[A-Za-z0-9_-]{43}$/);

    const stored = await db().collection('member_invitations').findOne({ email });
    expect(stored!.tokenHash).toBeTruthy();
    expect(JSON.stringify(stored)).not.toContain(tokenOf(sent));

    const list = await listInvitationsRoute(getRequest('/api/member-invitations', cookie));
    const items = ((await list.json()) as { items: Record<string, unknown>[] }).items;
    expect(items).toHaveLength(1);
    expect(items[0]).not.toHaveProperty('joinUrl');
    expect(items[0]).not.toHaveProperty('tokenHash');

    const logs = await db().collection('activity_logs').find().toArray();
    expect(logs.map((log) => log.action)).toEqual(['member.invited']);
  });

  it('rejects a second pending invitation and inviting an existing member', async () => {
    const { admin, joiner } = await weddingWithMember();
    const email = freshEmail();
    await invited(admin.cookie, email);
    expect(await errorCode(await invite(admin.cookie, { email, role: 'ADMIN' }))).toBe(
      'INVITATION_PENDING',
    );
    expect(
      await errorCode(await invite(admin.cookie, { email: joiner.email, role: 'MANAGER' })),
    ).toBe('ALREADY_MEMBER');
  });

  it('caps members plus pending invitations at 25', async () => {
    const { cookie, weddingId } = await adminWithWedding();
    const now = new Date();
    await db()
      .collection('member_invitations')
      .insertMany(
        Array.from({ length: 24 }, (_, i) => ({
          weddingId: new Types.ObjectId(weddingId),
          email: `filler${i}@example.com`,
          role: 'MANAGER',
          tokenHash: `hash-${i}-${Date.now()}`,
          status: 'PENDING',
          invitedByUserId: new Types.ObjectId(),
          expiresAt: new Date(now.getTime() + 86_400_000),
          createdAt: now,
          updatedAt: now,
        })),
      );
    const res = await invite(cookie, { email: freshEmail(), role: 'MANAGER' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: { code: 'LIMIT_REACHED', details: { limit: 25 } },
    });
  });

  it('lets Managers see members but nothing else', async () => {
    const { admin, joiner } = await weddingWithMember('MANAGER');
    expect(await members(joiner.cookie)).toHaveLength(2);
    expect(
      await errorCode(await invite(joiner.cookie, { email: freshEmail(), role: 'ADMIN' })),
    ).toBe('FORBIDDEN');
    expect(
      await errorCode(
        await listInvitationsRoute(getRequest('/api/member-invitations', joiner.cookie)),
      ),
    ).toBe('FORBIDDEN');
    const adminId = (await members(admin.cookie)).find((m) => m.role === 'ADMIN')!.userId;
    expect(await errorCode(await patch(joiner.cookie, adminId, { role: 'MANAGER' }))).toBe(
      'FORBIDDEN',
    );
    expect(await errorCode(await remove(joiner.cookie, adminId))).toBe('FORBIDDEN');
  });

  it('accepting joins the wedding once, with the invited role and label', async () => {
    const { cookie, weddingId } = await adminWithWedding();
    const joiner = await account('Meera Kapoor');
    const sent = await invited(cookie, joiner.email, 'ADMIN', "Groom's Sister");

    const res = await accept(joiner.cookie, tokenOf(sent));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      membership: { role: 'ADMIN', label: "Groom's Sister" },
      wedding: { id: weddingId },
    });
    expect(await adminCount(weddingId)).toBe(2);
    expect(
      await db().collection('member_invitations').findOne({ email: joiner.email }),
    ).toMatchObject({ status: 'ACCEPTED' });
    const actions = (await db().collection('activity_logs').find().toArray()).map((l) => l.action);
    expect(actions).toEqual(['member.invited', 'member.joined']);

    // The link is spent: the same 404 as an unknown token.
    expect(await errorCode(await accept(joiner.cookie, tokenOf(sent)))).toBe('ALREADY_MEMBER');
    expect((await preview(tokenOf(sent))).status).toBe(404);
  });

  it('rejects another email, an expired link and a user who already has a wedding', async () => {
    const { cookie } = await adminWithWedding();
    const invitee = freshEmail();
    const sent = await invited(cookie, invitee);

    const stranger = await account('Ravi');
    const mismatch = await accept(stranger.cookie, tokenOf(sent));
    expect(mismatch.status).toBe(403);
    expect(await errorCode(mismatch)).toBe('INVITE_EMAIL_MISMATCH');

    const other = await adminWithWedding('Arjun');
    const busy = await accept(other.cookie, tokenOf(sent));
    expect(await busy.json()).toMatchObject({
      error: { code: 'ALREADY_MEMBER', details: { currentWeddingIsEmpty: true } },
    });
    await createGuestRoute(
      jsonRequest(
        'POST',
        '/api/guests',
        { name: 'Sharma Family', maxPeople: 2, invitedEventIds: [] },
        other.cookie,
      ),
    );
    expect(await (await accept(other.cookie, tokenOf(sent))).json()).toMatchObject({
      error: { details: { currentWeddingIsEmpty: false } },
    });

    await db()
      .collection('member_invitations')
      .updateOne({ email: invitee }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const owner = await account('Meera', invitee);
    expect(await errorCode(await accept(owner.cookie, tokenOf(sent)))).toBe('INVITATION_EXPIRED');
    expect(await (await preview(tokenOf(sent))).json()).toMatchObject({ status: 'EXPIRED' });
  });

  it('signup with memberInviteToken joins in the same request, or creates no account', async () => {
    const { cookie, weddingId } = await adminWithWedding();
    const email = freshEmail();
    const sent = await invited(cookie, email);

    const wrong = freshEmail('other');
    const mismatch = await signupRoute(
      jsonRequest('POST', '/api/auth/signup', {
        name: 'Ravi',
        email: wrong,
        password: PASSWORD,
        memberInviteToken: tokenOf(sent),
      }),
    );
    expect(await errorCode(mismatch)).toBe('INVITE_EMAIL_MISMATCH');
    expect(await db().collection('users').findOne({ email: wrong })).toBeNull();

    const res = await signupRoute(
      jsonRequest('POST', '/api/auth/signup', {
        name: 'Meera',
        email,
        password: PASSWORD,
        memberInviteToken: tokenOf(sent),
      }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      membership: { role: 'MANAGER' },
      wedding: { id: weddingId },
    });
  });

  it('resend replaces the link and revoke disables it', async () => {
    const { cookie } = await adminWithWedding();
    const sent = await invited(cookie, freshEmail());

    const resent = (await (await resend(cookie, sent.id)).json()) as Sent;
    expect(tokenOf(resent)).not.toBe(tokenOf(sent));
    expect((await preview(tokenOf(sent))).status).toBe(404);
    expect((await preview(tokenOf(resent))).status).toBe(200);

    const revoked = await revoke(cookie, sent.id);
    expect(await revoked.json()).toMatchObject({ status: 'REVOKED' });
    expect((await preview(tokenOf(resent))).status).toBe(404);
    expect((await resend(cookie, sent.id)).status).toBe(404);
  });

  it('public preview: unknown and malformed tokens are the same 404 with minimal fields', async () => {
    const { cookie } = await adminWithWedding();
    const sent = await invited(cookie, freshEmail(), 'ADMIN');
    const res = await preview(tokenOf(sent));
    expect(res.headers.get('X-Robots-Tag')).toContain('noindex');
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['email', 'invitedBy', 'role', 'status', 'wedding']);

    const unknown = await preview('A'.repeat(43));
    const malformed = await preview('nope');
    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(await errorCode(unknown)).toBe(await errorCode(malformed));
  });

  it('never lets one wedding touch another wedding’s members or invitations', async () => {
    const a = await weddingWithMember();
    const b = await adminWithWedding('Arjun');
    const bSent = await invited(b.cookie, freshEmail());

    expect(await members(b.cookie)).toHaveLength(1);
    expect((await patch(b.cookie, a.joiner.userId, { role: 'ADMIN' })).status).toBe(404);
    expect((await remove(b.cookie, a.joiner.userId)).status).toBe(404);
    expect((await resend(a.admin.cookie, bSent.id)).status).toBe(404);
    expect((await revoke(a.admin.cookie, bSent.id)).status).toBe(404);
    expect((await patch(a.admin.cookie, 'not-an-id', { role: 'ADMIN' })).status).toBe(404);
  });

  it('never leaves a wedding without an Admin', async () => {
    const { admin, joiner } = await weddingWithMember('MANAGER');
    const adminId = (await members(admin.cookie)).find((m) => m.role === 'ADMIN')!.userId;

    expect(await errorCode(await patch(admin.cookie, adminId, { role: 'MANAGER' }))).toBe(
      'LAST_ADMIN',
    );
    expect(await errorCode(await remove(admin.cookie, adminId))).toBe('LAST_ADMIN');
    expect(await adminCount(admin.weddingId)).toBe(1);

    // Promote, then the original Admin may step down.
    const promoted = await patch(admin.cookie, joiner.userId, { role: 'ADMIN' });
    expect(await promoted.json()).toMatchObject({ role: 'ADMIN' });
    expect(await adminCount(admin.weddingId)).toBe(2);
    expect((await patch(admin.cookie, adminId, { role: 'MANAGER' })).status).toBe(200);
    expect(await adminCount(admin.weddingId)).toBe(1);
  });

  it('two Admins demoting each other at once leave one Admin', async () => {
    const { admin, joiner } = await weddingWithMember('ADMIN');
    const adminId = (await members(admin.cookie)).find((m) => m.userId !== joiner.userId)!.userId;
    const results = await Promise.all([
      patch(admin.cookie, joiner.userId, { role: 'MANAGER' }),
      patch(joiner.cookie, adminId, { role: 'MANAGER' }),
    ]);
    const statuses = results.map((res) => res.status).sort();
    expect(statuses).toContain(200);
    const admins = await db()
      .collection('wedding_memberships')
      .countDocuments({ weddingId: new Types.ObjectId(admin.weddingId), role: 'ADMIN' });
    expect(admins).toBe(1);
    expect(await adminCount(admin.weddingId)).toBe(1);
  });

  it('edits and clears a label, and removal deletes the membership and logs it', async () => {
    const { admin, joiner } = await weddingWithMember();
    expect(
      await (await patch(admin.cookie, joiner.userId, { label: 'Cousin' })).json(),
    ).toMatchObject({ label: 'Cousin' });
    const cleared = (await (
      await patch(admin.cookie, joiner.userId, { label: null })
    ).json()) as Member;
    expect(cleared).not.toHaveProperty('label');

    expect((await remove(admin.cookie, joiner.userId)).status).toBe(204);
    expect(await members(admin.cookie)).toHaveLength(1);
    const removedRes = await listMembersRoute(getRequest('/api/members', joiner.cookie));
    expect(await errorCode(removedRes)).toBe('NO_WEDDING');
    const actions = (await db().collection('activity_logs').find().toArray()).map((l) => l.action);
    expect(actions).toContain('member.removed');
  });
});
