import 'server-only';
import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { tenantGuard } from '@/server/db/tenant-guard';

/** Actions from DATABASE_DESIGN §5.15. Add to this list only with the doc. */
export const ACTIVITY_ACTIONS = [
  'member.invited',
  'member.joined',
  'member.removed',
  'member.role_changed',
  'guest.created',
  'guest.updated',
  'guest.deleted',
  'guest.imported',
  'guest.link_regenerated',
  'expense.created',
  'expense.updated',
  'expense.deleted',
  'event.deleted',
  'photo.deleted',
  'website.published',
  'website.unpublished',
] as const;

export class AppendOnlyError extends Error {
  override name = 'AppendOnlyError';
}

/**
 * `activity_logs` (DATABASE_DESIGN §5.15): append-only. Every update or delete through this model
 * throws; the only deletion path is wedding deletion through the native collection (§6.3).
 */
const activitySchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    actor: {
      type: new Schema(
        {
          userId: { type: Schema.Types.ObjectId, required: true },
          name: { type: String, required: true },
        },
        { _id: false },
      ),
      required: true,
    },
    action: { type: String, required: true, enum: ACTIVITY_ACTIONS },
    target: {
      type: new Schema(
        {
          type: { type: String, required: true },
          id: { type: Schema.Types.ObjectId },
          label: { type: String, required: true, maxlength: 120 },
        },
        { _id: false },
      ),
      required: true,
    },
    changes: {
      type: [
        new Schema(
          { field: String, before: Schema.Types.Mixed, after: Schema.Types.Mixed },
          { _id: false },
        ),
      ],
      default: undefined,
    },
    meta: { type: Schema.Types.Mixed },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    collection: 'activity_logs',
  },
);
activitySchema.index({ weddingId: 1, createdAt: -1, _id: -1 });
activitySchema.plugin(tenantGuard);
activitySchema.pre(
  [
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'replaceOne',
    'findOneAndReplace',
    'deleteOne',
    'deleteMany',
    'findOneAndDelete',
  ],
  function () {
    throw new AppendOnlyError('activity_logs is append-only');
  },
);

export type ActivityDoc = InferSchemaType<typeof activitySchema> & { _id: mongoose.Types.ObjectId };

export const Activity: Model<ActivityDoc> =
  (mongoose.models.Activity as Model<ActivityDoc>) ??
  mongoose.model<ActivityDoc>('Activity', activitySchema);
