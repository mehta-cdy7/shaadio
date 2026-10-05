import 'server-only';
import type { ClientSession, Types } from 'mongoose';
import { Activity, type ACTIVITY_ACTIONS } from './activity.model';

export type ActivityEntry = {
  weddingId: Types.ObjectId;
  actor: { userId: Types.ObjectId; name: string };
  action: (typeof ACTIVITY_ACTIONS)[number];
  target: { type: string; id?: Types.ObjectId; label: string };
  changes?: Array<{ field: string; before: unknown; after: unknown }>;
  meta?: Record<string, unknown>;
};

/**
 * Appends an activity entry inside the caller's transaction (DATABASE_DESIGN §5.15, §8), so a
 * change that commits is always logged and a log entry never describes a change that rolled back.
 */
export async function recordActivity(session: ClientSession, entry: ActivityEntry): Promise<void> {
  await Activity.create(
    [{ ...entry, target: { ...entry.target, label: entry.target.label.slice(0, 120) } }],
    {
      session,
    },
  );
}
