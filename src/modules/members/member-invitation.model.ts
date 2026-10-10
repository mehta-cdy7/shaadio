import 'server-only';
import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { tenantGuard } from '@/server/db/tenant-guard';
import { LABEL_MAX, ROLES } from './schemas';

/**
 * `member_invitations` (DATABASE_DESIGN §5.6). Only the HMAC of the emailed token is stored.
 * "Expired" is computed from `expiresAt`; resend writes a new hash and expiry on the same document,
 * so the old link stops working. Production indexes come from migration 0005.
 */
const memberInvitationSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    role: { type: String, required: true, enum: ROLES },
    label: { type: String, trim: true, maxlength: LABEL_MAX },
    tokenHash: { type: String, required: true, select: false },
    status: { type: String, required: true, enum: ['PENDING', 'ACCEPTED', 'REVOKED'] },
    invitedByUserId: { type: Schema.Types.ObjectId, required: true },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date },
    acceptedByUserId: { type: Schema.Types.ObjectId },
  },
  { timestamps: true, versionKey: false, collection: 'member_invitations' },
);
memberInvitationSchema.index({ tokenHash: 1 }, { unique: true });
memberInvitationSchema.index(
  { weddingId: 1, email: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' } },
);
memberInvitationSchema.index({ weddingId: 1, status: 1 });
memberInvitationSchema.plugin(tenantGuard);

export type MemberInvitationDoc = InferSchemaType<typeof memberInvitationSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
};

export const MemberInvitation: Model<MemberInvitationDoc> =
  (mongoose.models.MemberInvitation as Model<MemberInvitationDoc>) ??
  mongoose.model<MemberInvitationDoc>('MemberInvitation', memberInvitationSchema);
