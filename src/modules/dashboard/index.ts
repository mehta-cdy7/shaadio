import 'server-only';
import type { Types } from 'mongoose';
import { daysBetween, todayIn } from '@/lib/dates';
import { eventSummary } from '@/modules/events';
import type { DashboardResponse } from './schemas';

/**
 * `GET /api/dashboard` (API_DESIGN §11), computed on read (DATABASE_DESIGN §13.1, DB-06). Tasks,
 * guests, expenses and vendors do not exist yet, so their numbers are zero; each module adds its
 * query here when it lands (guests in slice 4, the rest in M3).
 */
export async function getDashboard(ctx: {
  weddingId: Types.ObjectId;
  wedding: { weddingDate: string; timezone: string };
}): Promise<DashboardResponse> {
  const { wedding } = ctx;
  const today = todayIn(wedding.timezone);
  return {
    daysToGo: daysBetween(today, wedding.weddingDate),
    events: await eventSummary(ctx, today, 3),
    tasks: { done: 0, total: 0, upcoming: [] },
    guests: {
      invitations: 0,
      peopleInvited: 0,
      attending: 0,
      notAttending: 0,
      pending: 0,
      peopleAttending: 0,
      respondedViaLink: 0,
      notInvitedToAnyEvent: 0,
    },
    expenses: { totalPaise: 0 },
    vendors: { count: 0 },
  };
}
