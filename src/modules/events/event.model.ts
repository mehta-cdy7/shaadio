import 'server-only';
import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { tenantGuard } from '@/server/db/tenant-guard';
import {
  DRESS_CODE_MAX,
  EVENT_DESCRIPTION_MAX,
  EVENT_NAME_MAX,
  EVENT_TYPES,
  MAP_URL_MAX,
  VENUE_ADDRESS_MAX,
  VENUE_NAME_MAX,
} from './schemas';

/**
 * `events` (DATABASE_DESIGN §5.7). Dates and times are wall-clock strings in the wedding's
 * timezone (§1.4, §1.5), so sorting by `date` then `startTime` is chronological.
 */
const eventSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    name: { type: String, required: true, trim: true, maxlength: EVENT_NAME_MAX },
    type: { type: String, required: true, enum: EVENT_TYPES },
    date: { type: String, required: true },
    startTime: { type: String },
    endTime: { type: String },
    venue: {
      type: new Schema(
        {
          name: { type: String, trim: true, maxlength: VENUE_NAME_MAX },
          address: { type: String, trim: true, maxlength: VENUE_ADDRESS_MAX },
          mapUrl: { type: String, trim: true, maxlength: MAP_URL_MAX },
        },
        { _id: false },
      ),
    },
    description: { type: String, trim: true, maxlength: EVENT_DESCRIPTION_MAX },
    dressCode: { type: String, trim: true, maxlength: DRESS_CODE_MAX },
    coverImageKey: { type: String },
    createdByUserId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  },
  { timestamps: true, versionKey: false, collection: 'events' },
);
eventSchema.index({ weddingId: 1, date: 1, startTime: 1 });
eventSchema.plugin(tenantGuard);

export type EventDoc = InferSchemaType<typeof eventSchema> & { _id: mongoose.Types.ObjectId };

export const Event: Model<EventDoc> =
  (mongoose.models.Event as Model<EventDoc>) ?? mongoose.model<EventDoc>('Event', eventSchema);
