import 'server-only';
import type { Types } from 'mongoose';
import { daysBetween, todayIn } from '@/lib/dates';
import { eventSummary } from '@/modules/events';
import { guestSummary } from '@/modules/guests';
import type { DashboardResponse } from './schemas';

/**
 * `GET /api/dashboard` (API_DESIGN §11), computed on read (DATABASE_DESIGN §13.1, DB-06). Tasks,
 * expenses and vendors do not exist yet, so their numbers are zero; each module adds its query here
 * when it lands (M3).
 */
export async function getDashboard(ctx: {
  weddingId: Types.ObjectId;
  wedding: { weddingDate: string; timezone: string };
}): Promise<DashboardResponse> {
  const { wedding } = ctx;
  const today = todayIn(wedding.timezone);
  const [events, guests] = await Promise.all([eventSummary(ctx, today, 3), guestSummary(ctx)]);
  return {
    daysToGo: daysBetween(today, wedding.weddingDate),
    events,
    tasks: { done: 0, total: 0, upcoming: [] },
    guests,
    expenses: { totalPaise: 0 },
    vendors: { count: 0 },
  };
}
