import 'server-only';
import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { tenantGuard } from '@/server/db/tenant-guard';
import { PHOTO_MIME_TYPES, UPLOADER_NAME_MAX, UPLOADER_TYPES } from './schemas';

/**
 * `photo_uploads` (DATABASE_DESIGN §5.13): one document per photo between "upload URLs issued" and
 * "published". Each holds one reserved slot of the 2,000-photo cap. `expiresAt` is deliberately
 * not a TTL index: a silent delete would leak the slot and the staging objects (§5.13).
 */
const photoUploadSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    uploaderType: { type: String, required: true, enum: UPLOADER_TYPES },
    uploaderUserId: { type: Schema.Types.ObjectId },
    uploaderName: { type: String, trim: true, maxlength: UPLOADER_NAME_MAX },
    deviceIdHash: { type: String },
    eventId: { type: Schema.Types.ObjectId },
    keyId: { type: String, required: true, immutable: true },
    stagingDisplayKey: { type: String, required: true, immutable: true },
    stagingThumbKey: { type: String, required: true, immutable: true },
    declared: {
      type: new Schema(
        {
          mimeType: { type: String, required: true, enum: PHOTO_MIME_TYPES },
          displayBytes: { type: Number, required: true },
          thumbBytes: { type: Number, required: true },
          width: { type: Number, required: true },
          height: { type: Number, required: true },
        },
        { _id: false },
      ),
      required: true,
    },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    collection: 'photo_uploads',
  },
);
photoUploadSchema.index({ weddingId: 1, createdAt: 1 });
photoUploadSchema.index({ expiresAt: 1 });
photoUploadSchema.plugin(tenantGuard);

export type PhotoUploadDoc = InferSchemaType<typeof photoUploadSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const PhotoUpload: Model<PhotoUploadDoc> =
  (mongoose.models.PhotoUpload as Model<PhotoUploadDoc>) ??
  mongoose.model<PhotoUploadDoc>('PhotoUpload', photoUploadSchema);
