import 'server-only';
import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { tenantGuard } from '@/server/db/tenant-guard';

export const EMAIL_JOB_STATUSES = ['PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED'] as const;
export const EMAIL_JOB_KINDS = ['GUEST_INVITATION', 'RSVP_REMINDER'] as const;
export const EMAIL_JOB_MAX_ATTEMPTS = 3;
/** At most one waiting job per guest and kind (migration 0007): a double queue cannot email twice. */
export const WAITING_ONLY = { status: { $in: ['PENDING', 'PROCESSING'] } };

/**
 * `email_jobs` (DATABASE_DESIGN §5.14): one queued email to one guest. Tenant-scoped; only the
 * worker's claim reads across weddings, in src/server/db/unscoped.ts (§6.3 #6). Production indexes
 * come from migrations 0006 and 0007.
 */
const emailJobSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    campaignId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    kind: { type: String, required: true, enum: EMAIL_JOB_KINDS, immutable: true },
    guestId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    toEmail: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    status: { type: String, required: true, enum: EMAIL_JOB_STATUSES },
    attempts: { type: Number, required: true, default: 0 },
    claimId: { type: String },
    lockedUntil: { type: Date },
    lastAttemptAt: { type: Date },
    lastError: { type: String, maxlength: 500 },
    providerMessageId: { type: String },
    sentAt: { type: Date },
    idempotencyKey: { type: String, required: true, immutable: true },
    purgeAt: { type: Date },
    createdByUserId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  },
  { timestamps: true, versionKey: false, collection: 'email_jobs' },
);
emailJobSchema.index({ idempotencyKey: 1 }, { unique: true });
emailJobSchema.index({ status: 1, createdAt: 1 });
emailJobSchema.index({ weddingId: 1, campaignId: 1, status: 1 });
emailJobSchema.index({ weddingId: 1, guestId: 1 });
emailJobSchema.index(
  { weddingId: 1, guestId: 1, kind: 1 },
  { unique: true, partialFilterExpression: WAITING_ONLY, name: 'one_waiting_per_guest' },
);
emailJobSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });
emailJobSchema.plugin(tenantGuard);

export type EmailJobDoc = InferSchemaType<typeof emailJobSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
};

export const EmailJob: Model<EmailJobDoc> =
  (mongoose.models.EmailJob as Model<EmailJobDoc>) ??
  mongoose.model<EmailJobDoc>('EmailJob', emailJobSchema);
