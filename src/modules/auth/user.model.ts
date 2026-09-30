import 'server-only';
import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/** `users` (DATABASE_DESIGN §5.1). Not tenant data: the link to a wedding is a membership. */
const userSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    lastLoginAt: { type: Date },
  },
  { timestamps: true, versionKey: false, collection: 'users' },
);
userSchema.index({ email: 1 }, { unique: true });

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: mongoose.Types.ObjectId };

export const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) ?? mongoose.model<UserDoc>('User', userSchema);
