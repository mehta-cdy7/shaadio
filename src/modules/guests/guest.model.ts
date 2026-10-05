import 'server-only';
import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { tenantGuard } from '@/server/db/tenant-guard';
import {
  EMAIL_MAX,
  GUEST_NAME_MAX,
  INVITED_EVENTS_MAX,
  MAX_PEOPLE_MAX,
  MAX_PEOPLE_MIN,
  NOTES_MAX,
  RSVP_STATUSES,
  SIDES,
} from './schemas';

/**
 * Case-insensitive name order for the guest list (DATABASE_DESIGN §5.8). The list query and the
 * `{ weddingId, name }` index use the same collation, so the index serves the sort.
 */
export const NAME_COLLATION = { locale: 'en', strength: 2 } as const;

/**
 * `guests` (DATABASE_DESIGN §5.8): one document is one invitation, a person or a family. Every
 * write increments `version` (§10); the invitation token is `select: false` (§1.10).
 */
const guestSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    name: { type: String, required: true, trim: true, maxlength: GUEST_NAME_MAX },
    side: { type: String, enum: SIDES },
    email: { type: String, trim: true, lowercase: true, maxlength: EMAIL_MAX },
    phone: { type: String },
    maxPeople: { type: Number, required: true, min: MAX_PEOPLE_MIN, max: MAX_PEOPLE_MAX },
    invitedEvents: {
      type: [
        new Schema({ eventId: { type: Schema.Types.ObjectId, required: true } }, { _id: false }),
      ],
      default: [],
      validate: {
        validator: (items: unknown[]) => items.length <= INVITED_EVENTS_MAX,
        message: `At most ${INVITED_EVENTS_MAX} events.`,
      },
    },
    rsvp: {
      type: new Schema(
        {
          status: { type: String, enum: RSVP_STATUSES, required: true, default: 'PENDING' },
          attendingCount: { type: Number, required: true, default: 0, min: 0 },
          respondedAt: { type: Date },
          respondedVia: { type: String, enum: ['GUEST_LINK', 'MEMBER'] },
        },
        { _id: false },
      ),
      required: true,
      default: () => ({}),
    },
    inviteLink: {
      type: new Schema(
        {
          token: { type: String, required: true, select: false },
          issuedAt: { type: Date, required: true },
          firstOpenedAt: { type: Date },
        },
        { _id: false },
      ),
      required: true,
    },
    delivery: {
      type: new Schema(
        {
          sentAt: { type: Date, required: true },
          sentVia: { type: String, enum: ['EMAIL', 'WHATSAPP', 'MANUAL'], required: true },
        },
        { _id: false },
      ),
    },
    notes: { type: String, trim: true, maxlength: NOTES_MAX },
    version: { type: Number, required: true, default: 0 },
    createdByUserId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  },
  { timestamps: true, versionKey: false, collection: 'guests' },
);
guestSchema.index({ 'inviteLink.token': 1 }, { unique: true });
guestSchema.index({ weddingId: 1, name: 1 }, { collation: NAME_COLLATION });
guestSchema.index({ weddingId: 1, 'invitedEvents.eventId': 1 });
guestSchema.index({ weddingId: 1, phone: 1 });
guestSchema.plugin(tenantGuard);

export type GuestDoc = InferSchemaType<typeof guestSchema> & { _id: mongoose.Types.ObjectId };

export const Guest: Model<GuestDoc> =
  (mongoose.models.Guest as Model<GuestDoc>) ?? mongoose.model<GuestDoc>('Guest', guestSchema);
