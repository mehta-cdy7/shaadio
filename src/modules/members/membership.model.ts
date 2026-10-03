import 'server-only';
import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { tenantGuard } from '@/server/db/tenant-guard';

export const ROLES = ['ADMIN', 'MANAGER'] as const;

/**
 * `wedding_memberships` (DATABASE_DESIGN §5.5). The unique `userId` index IS the one-wedding-per-user
 * rule (PRD Rule 1). Tenant-scoped: looking one up by `userId` alone is unscoped lookup #1 and lives
 * in src/server/db/unscoped.ts.
 */
const membershipSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    userId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    role: { type: String, required: true, enum: ROLES },
    label: { type: String, trim: true, maxlength: 60 },
    joinedAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false, collection: 'wedding_memberships' },
);
membershipSchema.index({ userId: 1 }, { unique: true });
membershipSchema.index({ weddingId: 1, role: 1 });
membershipSchema.plugin(tenantGuard);

export type MembershipDoc = InferSchemaType<typeof membershipSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Membership: Model<MembershipDoc> =
  (mongoose.models.Membership as Model<MembershipDoc>) ??
  mongoose.model<MembershipDoc>('Membership', membershipSchema);
