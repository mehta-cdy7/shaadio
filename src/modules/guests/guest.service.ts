import 'server-only';
import { createHash } from 'node:crypto';
import { Types, type ClientSession } from 'mongoose';
import type { z } from 'zod';
import { recordActivity } from '@/modules/activity';
import { assertEventsExist } from '@/modules/events';
import { newLinkToken } from '@/server/auth/tokens';
import { connectDb } from '@/server/db/connection';
import { toObjectId } from '@/server/db/ids';
import { withTransaction } from '@/server/db/transaction';
import { AppError } from '@/server/http/errors';
import { Guest, NAME_COLLATION, type GuestDoc } from './guest.model';
import { toGuestDetail, toGuestResponse } from './mapper';
import {
  GUESTS_PER_WEDDING,
  PAGE_SIZE_DEFAULT,
  type createGuestSchema,
  type GuestDetailResponse,
  type GuestListQuery,
  type GuestListResponse,
  type GuestResponse,
  type GuestSummary,
  type memberRsvpSchema,
  type updateGuestSchema,
} from './schemas';

export type GuestCtx = {
  weddingId: Types.ObjectId;
  userId: Types.ObjectId;
  user: { name: string };
};
type Scope = { weddingId: Types.ObjectId };

type CreateGuest = z.output<typeof createGuestSchema>;
type UpdateGuest = z.output<typeof updateGuestSchema>;
type MemberRsvp = z.output<typeof memberRsvpSchema>;

function notFound(): AppError {
  return new AppError('NOT_FOUND', 'Guest not found.');
}

/** The id as an ObjectId; a malformed id is the same 404 as another wedding's (API §3.3). */
function guestId(id: string): Types.ObjectId {
  const objectId = toObjectId(id);
  if (!objectId) throw notFound();
  return objectId;
}

function actor(ctx: GuestCtx) {
  return { userId: ctx.userId, name: ctx.user.name };
}

// --- List ----------------------------------------------------------------------------------------

type Cursor = { n: string; i: string; f: string };

/** The filters a cursor was issued for (API_DESIGN §5.2): a cursor only continues the same list. */
function filterKey(query: GuestListQuery): string {
  const canonical = JSON.stringify([
    query.search?.toLowerCase() ?? '',
    [...(query.side ?? [])].sort(),
    query.eventId?.toLowerCase() ?? '',
    [...(query.rsvpStatus ?? [])].sort(),
    query.sent ?? '',
    query.opened ?? '',
    query.noEvents ?? '',
  ]);
  return createHash('sha256').update(canonical).digest('base64url').slice(0, 12);
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(value: string, key: string): Cursor {
  const invalid = () =>
    new AppError('VALIDATION_ERROR', 'This list has changed. Start again from the top.', {
      fields: { cursor: 'Invalid cursor.' },
    });
  let cursor: Partial<Cursor>;
  try {
    cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<Cursor>;
  } catch {
    throw invalid();
  }
  if (
    typeof cursor.n !== 'string' ||
    typeof cursor.i !== 'string' ||
    !toObjectId(cursor.i) ||
    cursor.f !== key
  ) {
    throw invalid();
  }
  return cursor as Cursor;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The list filters as one Mongo filter, always pinned to the wedding (API_DESIGN §14). */
function listFilter(scope: Scope, query: GuestListQuery): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];
  if (query.search) {
    const or: Record<string, unknown>[] = [
      { name: { $regex: `^${escapeRegex(query.search)}`, $options: 'i' } },
    ];
    const digits = query.search.replace(/\D/g, '');
    if (digits.length >= 3) or.push({ phone: { $regex: digits } });
    and.push({ $or: or });
  }
  if (query.side?.length) and.push({ side: { $in: query.side } });
  if (query.eventId) and.push({ 'invitedEvents.eventId': new Types.ObjectId(query.eventId) });
  if (query.rsvpStatus?.length) and.push({ 'rsvp.status': { $in: query.rsvpStatus } });
  if (query.sent !== undefined) and.push({ delivery: { $exists: query.sent } });
  if (query.opened !== undefined) {
    and.push({ 'inviteLink.firstOpenedAt': { $exists: query.opened } });
  }
  if (query.noEvents) and.push({ invitedEvents: { $size: 0 } });
  return { weddingId: scope.weddingId, ...(and.length ? { $and: and } : {}) };
}

/** `GET /api/guests`: one page, by name (case-insensitive), `_id` as the tiebreak (§5.2). */
export async function listGuests(scope: Scope, query: GuestListQuery): Promise<GuestListResponse> {
  const key = filterKey(query);
  const after = query.cursor ? decodeCursor(query.cursor, key) : undefined;
  const limit = query.limit ?? PAGE_SIZE_DEFAULT;
  const filter = listFilter(scope, query);
  if (after) {
    const afterId = new Types.ObjectId(after.i);
    filter.$or = [{ name: { $gt: after.n } }, { name: after.n, _id: { $gt: afterId } }];
  }

  await connectDb();
  const docs = await Guest.find(filter)
    .collation(NAME_COLLATION)
    .sort({ name: 1, _id: 1 })
    .limit(limit + 1)
    .lean();
  const page = docs.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(toGuestResponse),
    ...(docs.length > limit && last
      ? { nextCursor: encodeCursor({ n: last.name, i: last._id.toHexString(), f: key }) }
      : {}),
  };
}

/** How many guests match the filters (the "Showing 10 of 128" line). */
export async function countGuests(scope: Scope, query: GuestListQuery = {}): Promise<number> {
  await connectDb();
  return Guest.countDocuments(listFilter(scope, query));
}

export async function hasGuests(scope: Scope): Promise<boolean> {
  await connectDb();
  return Boolean(await Guest.exists({ weddingId: scope.weddingId }));
}

/**
 * The guest numbers for the dashboard and the guest list (DATABASE_DESIGN §13.1). Guests invited
 * to no event are left out of every number and counted on their own.
 */
export async function guestSummary(scope: Scope): Promise<GuestSummary> {
  await connectDb();
  const [totals, notInvitedToAnyEvent] = await Promise.all([
    Guest.aggregate<Omit<GuestSummary, 'notInvitedToAnyEvent'>>([
      { $match: { weddingId: scope.weddingId, 'invitedEvents.0': { $exists: true } } },
      {
        $group: {
          _id: null,
          invitations: { $sum: 1 },
          peopleInvited: { $sum: '$maxPeople' },
          attending: { $sum: { $cond: [{ $eq: ['$rsvp.status', 'ATTENDING'] }, 1, 0] } },
          notAttending: { $sum: { $cond: [{ $eq: ['$rsvp.status', 'NOT_ATTENDING'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ['$rsvp.status', 'PENDING'] }, 1, 0] } },
          peopleAttending: { $sum: '$rsvp.attendingCount' },
          respondedViaLink: {
            $sum: { $cond: [{ $eq: ['$rsvp.respondedVia', 'GUEST_LINK'] }, 1, 0] },
          },
        },
      },
      { $project: { _id: 0 } },
    ]),
    Guest.countDocuments({ weddingId: scope.weddingId, invitedEvents: { $size: 0 } }),
  ]);
  return {
    invitations: 0,
    peopleInvited: 0,
    attending: 0,
    notAttending: 0,
    pending: 0,
    peopleAttending: 0,
    respondedViaLink: 0,
    ...totals[0],
    notInvitedToAnyEvent,
  };
}

// --- One guest -----------------------------------------------------------------------------------

/** `GET /api/guests/:id`: the only member read that includes the invitation link (API §14). */
export async function getGuest(scope: Scope, id: string): Promise<GuestDetailResponse> {
  await connectDb();
  const guest = await Guest.findOne({ _id: guestId(id), weddingId: scope.weddingId })
    .select('+inviteLink.token')
    .lean();
  if (!guest) throw notFound();
  return toGuestDetail(guest);
}

/** Every id must be an event of this wedding (DATABASE_DESIGN §6.4). */
async function invitedEvents(scope: Scope, ids: string[]) {
  const eventIds = await assertEventsExist(scope, ids, 'invitedEventIds');
  return eventIds.map((eventId) => ({ eventId }));
}

/**
 * `POST /api/guests`. The 1,000-guest limit is soft (DATABASE_DESIGN §15): check, then insert.
 * The invitation token is generated here.
 */
export async function createGuest(ctx: GuestCtx, input: CreateGuest): Promise<GuestDetailResponse> {
  await connectDb();
  const events = await invitedEvents(ctx, input.invitedEventIds);
  const count = await Guest.countDocuments({ weddingId: ctx.weddingId });
  if (count >= GUESTS_PER_WEDDING) {
    throw new AppError('LIMIT_REACHED', 'This wedding already has the most guests allowed.', {
      limit: GUESTS_PER_WEDDING,
    });
  }

  const guest = await withTransaction(async (session) => {
    const [doc] = await Guest.create(
      [
        {
          weddingId: ctx.weddingId,
          name: input.name,
          ...(input.side ? { side: input.side } : {}),
          ...(input.email ? { email: input.email } : {}),
          ...(input.phone ? { phone: input.phone } : {}),
          maxPeople: input.maxPeople,
          invitedEvents: events,
          inviteLink: { token: newLinkToken(), issuedAt: new Date() },
          ...(input.notes ? { notes: input.notes } : {}),
          createdByUserId: ctx.userId,
        },
      ],
      { session },
    );
    await recordActivity(session, {
      weddingId: ctx.weddingId,
      actor: actor(ctx),
      action: 'guest.created',
      target: { type: 'guest', id: doc!._id, label: input.name },
    });
    return doc!.toObject();
  });
  return toGuestDetail(guest);
}

const OPTIONAL_FIELDS = ['side', 'email', 'phone', 'notes'] as const;

/** Comparable value of a field for the activity log's `changes` (DATABASE_DESIGN §5.15). */
function loggedValue(guest: GuestDoc, field: keyof UpdateGuest): unknown {
  if (field === 'invitedEventIds') {
    return guest.invitedEvents.map((item) => item.eventId.toHexString());
  }
  return guest[field] ?? null;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * `PATCH /api/guests/:id`: last-write-wins with targeted `$set`/`$unset` (DATABASE_DESIGN §10).
 * Lowering `maxPeople` below the confirmed count fails in the update filter, so a concurrent RSVP
 * cannot slip past it. Changing the invited events never changes the RSVP (§14.1).
 */
export async function updateGuest(
  ctx: GuestCtx,
  id: string,
  input: UpdateGuest,
): Promise<GuestResponse> {
  const _id = guestId(id);
  await connectDb();
  const events =
    input.invitedEventIds === undefined
      ? undefined
      : await invitedEvents(ctx, input.invitedEventIds);

  return withTransaction(async (session) => {
    const current = await Guest.findOne({ _id, weddingId: ctx.weddingId }, null, {
      session,
    }).lean();
    if (!current) throw notFound();

    const set: Record<string, unknown> = {};
    const unset: Record<string, ''> = {};
    if (input.name !== undefined) set.name = input.name;
    if (input.maxPeople !== undefined) set.maxPeople = input.maxPeople;
    if (events) set.invitedEvents = events;
    for (const key of OPTIONAL_FIELDS) {
      const value = input[key];
      if (value === undefined) continue;
      if (value === null || value === '') unset[key] = '';
      else set[key] = value;
    }

    const after = { ...current, ...set } as GuestDoc;
    for (const key of Object.keys(unset)) delete (after as Record<string, unknown>)[key];
    const changes = (Object.keys(input) as Array<keyof UpdateGuest>)
      .filter((field) => input[field] !== undefined)
      .map((field) => ({
        field,
        before: loggedValue(current, field),
        after: loggedValue(after, field),
      }))
      .filter((change) => !sameValue(change.before, change.after));
    if (!changes.length) return toGuestResponse(current);

    const filter = {
      _id,
      weddingId: ctx.weddingId,
      ...(input.maxPeople !== undefined
        ? { 'rsvp.attendingCount': { $lte: input.maxPeople } }
        : {}),
    };
    const updated = await Guest.findOneAndUpdate(
      filter,
      {
        ...(Object.keys(set).length ? { $set: set } : {}),
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
        $inc: { version: 1 },
      },
      { session, returnDocument: 'after', runValidators: true },
    ).lean();
    if (!updated) {
      // The guest exists (read above), so only the capacity condition can have failed.
      const attendingCount =
        (await Guest.findOne({ _id, weddingId: ctx.weddingId }, { rsvp: 1 }, { session }).lean())
          ?.rsvp.attendingCount ?? current.rsvp.attendingCount;
      throw new AppError(
        'BELOW_CONFIRMED',
        'This guest has confirmed more people. Update their RSVP first.',
        { attendingCount },
      );
    }

    await recordActivity(session, {
      weddingId: ctx.weddingId,
      actor: actor(ctx),
      action: 'guest.updated',
      target: { type: 'guest', id: _id, label: updated.name },
      changes,
    });
    return toGuestResponse(updated);
  });
}

/**
 * `PATCH /api/guests/:id/rsvp`: a member records or corrects an answer. The update filter carries
 * the version the member loaded and the capacity check (DATABASE_DESIGN §10), so a guest answering
 * from their link meanwhile is a conflict, never silently overwritten.
 */
export async function updateGuestRsvp(
  ctx: GuestCtx,
  id: string,
  input: MemberRsvp,
): Promise<GuestResponse> {
  const _id = guestId(id);
  const count = input.status === 'ATTENDING' ? (input.attendingCount ?? 0) : 0;
  await connectDb();

  return withTransaction(async (session) => {
    const update =
      input.status === 'PENDING'
        ? {
            $set: { 'rsvp.status': 'PENDING', 'rsvp.attendingCount': 0 },
            $unset: { 'rsvp.respondedAt': '', 'rsvp.respondedVia': '' },
            $inc: { version: 1 },
          }
        : {
            $set: {
              'rsvp.status': input.status,
              'rsvp.attendingCount': count,
              'rsvp.respondedAt': new Date(),
              'rsvp.respondedVia': 'MEMBER',
            },
            $inc: { version: 1 },
          };
    const before = await Guest.findOne({ _id, weddingId: ctx.weddingId }, null, { session }).lean();
    if (!before) throw notFound();

    const updated = await Guest.findOneAndUpdate(
      {
        _id,
        weddingId: ctx.weddingId,
        version: input.expectedVersion,
        ...(count ? { maxPeople: { $gte: count } } : {}),
      },
      update,
      { session, returnDocument: 'after', runValidators: true },
    ).lean();
    if (!updated) {
      if (before.version !== input.expectedVersion) {
        throw new AppError('VERSION_CONFLICT', 'This RSVP changed while you were editing it.', {
          current: toGuestResponse(before),
        });
      }
      throw new AppError('CAPACITY_EXCEEDED', 'More people than this guest is allowed.', {
        maxPeople: before.maxPeople,
      });
    }

    await recordActivity(session, {
      weddingId: ctx.weddingId,
      actor: actor(ctx),
      action: 'guest.updated',
      target: { type: 'guest', id: _id, label: updated.name },
      changes: [
        {
          field: 'rsvp',
          before: { status: before.rsvp.status, attendingCount: before.rsvp.attendingCount },
          after: { status: updated.rsvp.status, attendingCount: updated.rsvp.attendingCount },
        },
      ],
    });
    return toGuestResponse(updated);
  });
}

/**
 * `POST /api/guests/:id/regenerate-link`: the old link stops working at once. `linkOpenedAt` and
 * `delivery` are cleared, because the new link has been neither sent nor opened (API_DESIGN §14).
 */
export async function regenerateGuestLink(ctx: GuestCtx, id: string): Promise<GuestDetailResponse> {
  const _id = guestId(id);
  await connectDb();
  const guest = await withTransaction(async (session) => {
    const updated = await Guest.findOneAndUpdate(
      { _id, weddingId: ctx.weddingId },
      {
        $set: { 'inviteLink.token': newLinkToken(), 'inviteLink.issuedAt': new Date() },
        $unset: { 'inviteLink.firstOpenedAt': '', delivery: '' },
        $inc: { version: 1 },
      },
      { session, returnDocument: 'after', projection: '+inviteLink.token' },
    ).lean();
    if (!updated) throw notFound();
    await recordActivity(session, {
      weddingId: ctx.weddingId,
      actor: actor(ctx),
      action: 'guest.link_regenerated',
      target: { type: 'guest', id: _id, label: updated.name },
    });
    return updated;
  });
  return toGuestDetail(guest);
}

/**
 * `DELETE /api/guests/:id` (DATABASE_DESIGN §14.2): the guest and `guest.deleted` in one
 * transaction. Cancelling the guest's pending emails joins this transaction with email jobs.
 */
export async function deleteGuest(ctx: GuestCtx, id: string): Promise<void> {
  const _id = guestId(id);
  await connectDb();
  await withTransaction(async (session) => {
    const guest = await Guest.findOneAndDelete(
      { _id, weddingId: ctx.weddingId },
      { session },
    ).lean();
    if (!guest) throw notFound();
    await recordActivity(session, {
      weddingId: ctx.weddingId,
      actor: actor(ctx),
      action: 'guest.deleted',
      target: { type: 'guest', id: _id, label: guest.name },
    });
  });
}

// --- For the events module -----------------------------------------------------------------------

export type Headcount = { households: number; people: number };

/**
 * Confirmed guests per event (DATABASE_DESIGN §13.2): an attending household counts at every event
 * it is invited to (ADR-13). Keyed by event id.
 */
export async function eventHeadcounts(scope: Scope): Promise<Map<string, Headcount>> {
  await connectDb();
  const rows = await Guest.aggregate<{ _id: Types.ObjectId } & Headcount>([
    { $match: { weddingId: scope.weddingId, 'rsvp.status': 'ATTENDING' } },
    { $unwind: '$invitedEvents' },
    {
      $group: {
        _id: '$invitedEvents.eventId',
        households: { $sum: 1 },
        people: { $sum: '$rsvp.attendingCount' },
      },
    },
  ]);
  return new Map(rows.map(({ _id, ...count }) => [_id.toHexString(), count]));
}

/** Names shown in the event delete dialog, at most this many (DATABASE_DESIGN §14.1). */
const ONLY_THIS_EVENT_NAMES = 20;

/** Who is invited to an event, and who is invited to it alone (DATABASE_DESIGN §14.1). */
export async function eventInvitees(
  scope: Scope,
  eventId: Types.ObjectId,
): Promise<{ invitedCount: number; onlyThisEvent: { count: number; names: string[] } }> {
  await connectDb();
  const only = {
    weddingId: scope.weddingId,
    invitedEvents: { $size: 1 },
    'invitedEvents.eventId': eventId,
  };
  const [invitedCount, count, names] = await Promise.all([
    Guest.countDocuments({ weddingId: scope.weddingId, 'invitedEvents.eventId': eventId }),
    Guest.countDocuments(only),
    Guest.find(only, { name: 1 })
      .collation(NAME_COLLATION)
      .sort({ name: 1, _id: 1 })
      .limit(ONLY_THIS_EVENT_NAMES)
      .lean(),
  ]);
  return { invitedCount, onlyThisEvent: { count, names: names.map((guest) => guest.name) } };
}

/**
 * The guest part of the event delete cascade (DATABASE_DESIGN §14.1), inside the caller's
 * transaction. RSVPs are left as they are.
 */
export async function removeEventFromGuests(
  session: ClientSession,
  scope: Scope,
  eventId: Types.ObjectId,
): Promise<{ affectedGuests: number; leftWithNoEvents: number }> {
  // Recounted here: the list may have changed since the dialog opened.
  const leftWithNoEvents = await Guest.countDocuments(
    { weddingId: scope.weddingId, invitedEvents: { $size: 1 }, 'invitedEvents.eventId': eventId },
    { session },
  );
  const { modifiedCount } = await Guest.updateMany(
    { weddingId: scope.weddingId, 'invitedEvents.eventId': eventId },
    { $pull: { invitedEvents: { eventId } }, $inc: { version: 1 } },
    { session },
  );
  return { affectedGuests: modifiedCount, leftWithNoEvents };
}

// --- For the invitation page ---------------------------------------------------------------------

export type InvitationGuest = {
  name: string;
  maxPeople: number;
  invitedEventIds: Types.ObjectId[];
  rsvp: { status: GuestDoc['rsvp']['status']; attendingCount: number };
};

/**
 * The guest behind a resolved invitation token (DATABASE_DESIGN §6.3 #3). The token is part of the
 * filter, so a link regenerated since the lookup is not found.
 */
export async function findInvitationGuest(
  scope: Scope,
  id: Types.ObjectId,
  token: string,
): Promise<InvitationGuest | undefined> {
  await connectDb();
  const guest = await Guest.findOne(
    { _id: id, weddingId: scope.weddingId, 'inviteLink.token': token },
    { name: 1, maxPeople: 1, invitedEvents: 1, rsvp: 1 },
  ).lean();
  if (!guest) return undefined;
  return {
    name: guest.name,
    maxPeople: guest.maxPeople,
    invitedEventIds: guest.invitedEvents.map((item) => item.eventId),
    rsvp: { status: guest.rsvp.status, attendingCount: guest.rsvp.attendingCount },
  };
}

/** First visit only: one conditional write per link, ever (DATABASE_DESIGN §5.8). */
export async function markInvitationOpened(
  scope: Scope,
  id: Types.ObjectId,
  token: string,
): Promise<void> {
  await connectDb();
  await Guest.updateOne(
    {
      _id: id,
      weddingId: scope.weddingId,
      'inviteLink.token': token,
      'inviteLink.firstOpenedAt': { $exists: false },
    },
    { $set: { 'inviteLink.firstOpenedAt': new Date() }, $inc: { version: 1 } },
  );
}

export type LinkRsvp =
  { status: 'ATTENDING'; attendingCount: number } | { status: 'NOT_ATTENDING' };

/**
 * The guest answers from their link (DATABASE_DESIGN §10): capacity and the token are in the update
 * filter, so neither a lowered `maxPeople` nor a regenerated link can be slipped past. One write,
 * no activity entry: the log records members' actions.
 */
export async function submitLinkRsvp(
  scope: Scope,
  id: Types.ObjectId,
  token: string,
  input: LinkRsvp,
): Promise<{ status: GuestDoc['rsvp']['status']; attendingCount: number }> {
  const count = input.status === 'ATTENDING' ? input.attendingCount : 0;
  await connectDb();
  const res = await Guest.updateOne(
    {
      _id: id,
      weddingId: scope.weddingId,
      'inviteLink.token': token,
      ...(count ? { maxPeople: { $gte: count } } : {}),
    },
    {
      $set: {
        'rsvp.status': input.status,
        'rsvp.attendingCount': count,
        'rsvp.respondedAt': new Date(),
        'rsvp.respondedVia': 'GUEST_LINK',
      },
      $inc: { version: 1 },
    },
  );
  if (res.matchedCount === 0) {
    const guest = await findInvitationGuest(scope, id, token);
    if (!guest) throw notFound();
    throw new AppError('CAPACITY_EXCEEDED', 'More people than this invitation allows.', {
      maxPeople: guest.maxPeople,
    });
  }
  return { status: input.status, attendingCount: count };
}
