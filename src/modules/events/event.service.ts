import 'server-only';
import type { Types } from 'mongoose';
import type { z } from 'zod';
import { recordActivity } from '@/modules/activity';
import { eventHeadcounts, eventInvitees, removeEventFromGuests } from '@/modules/guests';
import { connectDb } from '@/server/db/connection';
import { toObjectId } from '@/server/db/ids';
import { withTransaction } from '@/server/db/transaction';
import { AppError } from '@/server/http/errors';
import { Event, type EventDoc } from './event.model';
import { toEventResponse } from './mapper';
import {
  END_WITHOUT_START,
  eventTimeProblem,
  EVENTS_PER_WEDDING,
  latestEventDate,
  type createEventSchema,
  type EventDeletePreview,
  type EventResponse,
  type updateEventSchema,
} from './schemas';

export type EventCtx = {
  weddingId: Types.ObjectId;
  userId: Types.ObjectId;
  user: { name: string };
  wedding: { weddingDate: string };
};

type CreateEvent = z.output<typeof createEventSchema>;
type UpdateEvent = z.output<typeof updateEventSchema>;
type Venue = NonNullable<CreateEvent['venue']>;

function notFound(): AppError {
  return new AppError('NOT_FOUND', 'Event not found.');
}

/** The id as an ObjectId; a malformed id is the same 404 as another wedding's (API §3.3). */
function eventId(id: string): Types.ObjectId {
  const objectId = toObjectId(id);
  if (!objectId) throw notFound();
  return objectId;
}

/**
 * The date and time rules (PRD §9.5, API_DESIGN §13), checked against the event as it will be
 * stored. Fails as a field error, like the schema's own checks.
 */
function assertEventRules(
  weddingDate: string,
  event: { date: string; startTime?: string | null; endTime?: string | null },
  dateChanged: boolean,
): void {
  const fields: Record<string, string> = {};
  if (dateChanged && event.date > latestEventDate(weddingDate)) {
    fields.date = 'Choose a date no more than a year after the wedding.';
  }
  const timeProblem = eventTimeProblem(event.startTime, event.endTime);
  if (timeProblem) {
    fields.endTime =
      timeProblem === END_WITHOUT_START
        ? 'Add a start time first.'
        : 'The end time must differ from the start time.';
  }
  if (Object.keys(fields).length) {
    throw new AppError('VALIDATION_ERROR', 'Some fields are invalid.', { fields });
  }
}

/** A venue with no parts is no venue: stored absent, shown as "To be announced". */
function venueOrUndefined(venue: Venue | null | undefined): Venue | undefined {
  if (!venue) return undefined;
  const parts = Object.entries(venue).filter(([, value]) => value);
  return parts.length ? (Object.fromEntries(parts) as Venue) : undefined;
}

/** Each event with its confirmed headcount (DATABASE_DESIGN §13.2). */
async function withHeadcounts(
  ctx: { weddingId: Types.ObjectId },
  events: EventDoc[],
): Promise<EventResponse[]> {
  if (!events.length) return [];
  const counts = await eventHeadcounts(ctx);
  return events.map((event) => toEventResponse(event, counts.get(event._id.toHexString())));
}

/** All events, sorted by date then start time (API_DESIGN §13). */
export async function listEvents(ctx: { weddingId: Types.ObjectId }): Promise<EventResponse[]> {
  await connectDb();
  const events = await Event.find({ weddingId: ctx.weddingId })
    .sort({ date: 1, startTime: 1, _id: 1 })
    .lean();
  return withHeadcounts(ctx, events);
}

/**
 * Cross-reference check on write (DATABASE_DESIGN §6.4): every id must be an event of this
 * wedding. Returns them as ObjectIds; otherwise 404 naming the request `field` (API_DESIGN §14).
 */
export async function assertEventsExist(
  ctx: { weddingId: Types.ObjectId },
  ids: string[],
  field: string,
): Promise<Types.ObjectId[]> {
  const unique = [...new Set(ids.map((id) => id.toLowerCase()))];
  const missing = () => new AppError('NOT_FOUND', 'Event not found.', { field });
  const objectIds = unique.map((id) => {
    const objectId = toObjectId(id);
    if (!objectId) throw missing();
    return objectId;
  });
  if (!objectIds.length) return [];
  await connectDb();
  const found = await Event.countDocuments({
    _id: { $in: objectIds },
    weddingId: ctx.weddingId,
  });
  if (found !== objectIds.length) throw missing();
  return objectIds;
}

/** Whether the wedding has any event (for the wedding's `isEmpty`, API_DESIGN §11). */
export async function hasEvents(ctx: { weddingId: Types.ObjectId }): Promise<boolean> {
  await connectDb();
  return Boolean(await Event.exists({ weddingId: ctx.weddingId }));
}

export async function countEvents(ctx: { weddingId: Types.ObjectId }): Promise<number> {
  await connectDb();
  return Event.countDocuments({ weddingId: ctx.weddingId });
}

/** The next `limit` events from `today` on (DATABASE_DESIGN §5.7), and the total count. */
export async function eventSummary(
  ctx: { weddingId: Types.ObjectId },
  today: string,
  limit: number,
): Promise<{ count: number; upcoming: EventResponse[] }> {
  await connectDb();
  const [count, upcoming] = await Promise.all([
    Event.countDocuments({ weddingId: ctx.weddingId }),
    Event.find({ weddingId: ctx.weddingId, date: { $gte: today } })
      .sort({ date: 1, startTime: 1, _id: 1 })
      .limit(limit)
      .lean(),
  ]);
  return { count, upcoming: await withHeadcounts(ctx, upcoming) };
}

export async function getEvent(ctx: { weddingId: Types.ObjectId }, id: string) {
  await connectDb();
  const event = await Event.findOne({ _id: eventId(id), weddingId: ctx.weddingId }).lean();
  if (!event) throw notFound();
  const [response] = await withHeadcounts(ctx, [event]);
  return response!;
}

/**
 * `POST /api/events`. The 30-event limit is soft (DATABASE_DESIGN §15): check, then insert, so two
 * concurrent creates can overshoot by one, which harms nothing.
 */
export async function createEvent(ctx: EventCtx, input: CreateEvent): Promise<EventResponse> {
  assertEventRules(ctx.wedding.weddingDate, input, true);
  await connectDb();
  const count = await Event.countDocuments({ weddingId: ctx.weddingId });
  if (count >= EVENTS_PER_WEDDING) {
    throw new AppError('LIMIT_REACHED', 'This wedding already has the most events allowed.', {
      limit: EVENTS_PER_WEDDING,
    });
  }
  const venue = venueOrUndefined(input.venue);
  const [event] = await Event.create([
    {
      weddingId: ctx.weddingId,
      name: input.name,
      type: input.type,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      ...(venue ? { venue } : {}),
      description: input.description,
      dressCode: input.dressCode,
      createdByUserId: ctx.userId,
    },
  ]);
  return toEventResponse(event!.toObject());
}

/** `PATCH /api/events/:id`: targeted `$set`/`$unset`, never null stored (API-04). */
export async function updateEvent(
  ctx: { weddingId: Types.ObjectId; wedding: { weddingDate: string } },
  id: string,
  input: UpdateEvent,
): Promise<EventResponse> {
  await connectDb();
  const filter = { _id: eventId(id), weddingId: ctx.weddingId };

  if (input.date !== undefined || input.startTime !== undefined || input.endTime !== undefined) {
    const current = await Event.findOne(filter, { date: 1, startTime: 1, endTime: 1 }).lean();
    if (!current) throw notFound();
    const pick = (next: string | null | undefined, stored: string | null | undefined) =>
      next === undefined ? stored : next;
    assertEventRules(
      ctx.wedding.weddingDate,
      {
        date: input.date ?? current.date,
        startTime: pick(input.startTime, current.startTime),
        endTime: pick(input.endTime, current.endTime),
      },
      input.date !== undefined && input.date !== current.date,
    );
  }

  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};

  for (const key of ['name', 'type', 'date'] as const) {
    if (input[key] !== undefined) set[key] = input[key];
  }
  for (const key of ['startTime', 'endTime', 'description', 'dressCode'] as const) {
    const value = input[key];
    if (value === undefined) continue;
    if (value === null || value === '') unset[key] = '';
    else set[key] = value;
  }
  if (input.venue !== undefined) {
    const venue = venueOrUndefined(input.venue);
    if (venue) set.venue = venue;
    else unset.venue = '';
  }

  const update = {
    ...(Object.keys(set).length ? { $set: set } : {}),
    ...(Object.keys(unset).length ? { $unset: unset } : {}),
  };
  const event = Object.keys(update).length
    ? await Event.findOneAndUpdate(filter, update, {
        returnDocument: 'after',
        runValidators: true,
      }).lean()
    : await Event.findOne(filter).lean();
  if (!event) throw notFound();
  const [response] = await withHeadcounts(ctx, [event]);
  return response!;
}

/**
 * `GET /api/events/:id/delete-preview` (DATABASE_DESIGN §14.1): who loses this event. Tasks,
 * expenses and photos do not exist yet, so their counts are 0; each module adds its count here
 * when it lands (M3).
 */
export async function eventDeletePreview(
  ctx: { weddingId: Types.ObjectId },
  id: string,
): Promise<EventDeletePreview> {
  const _id = eventId(id);
  await connectDb();
  const exists = await Event.exists({ _id, weddingId: ctx.weddingId });
  if (!exists) throw notFound();
  return {
    ...(await eventInvitees(ctx, _id)),
    tasks: 0,
    expenses: 0,
    photos: 0,
  };
}

/**
 * `DELETE /api/events/:id`: one transaction deletes the event, removes it from every guest's
 * invitation and writes `event.deleted` (DATABASE_DESIGN §8, §14.1). The task, expense, vendor and
 * photo cascades join this transaction as those modules land (M3).
 */
export async function deleteEvent(ctx: EventCtx, id: string): Promise<void> {
  const _id = eventId(id);
  await connectDb();
  await withTransaction(async (session) => {
    const event = await Event.findOneAndDelete(
      { _id, weddingId: ctx.weddingId },
      { session },
    ).lean();
    if (!event) throw notFound();
    const meta = await removeEventFromGuests(session, ctx, _id);
    await recordActivity(session, {
      weddingId: ctx.weddingId,
      actor: { userId: ctx.userId, name: ctx.user.name },
      action: 'event.deleted',
      target: { type: 'event', id: _id, label: event.name },
      meta,
    });
  });
}
