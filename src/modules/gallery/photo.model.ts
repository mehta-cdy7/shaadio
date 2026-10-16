import 'server-only';
import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { tenantGuard } from '@/server/db/tenant-guard';
import { PHOTO_MIME_TYPES, UPLOADER_NAME_MAX, UPLOADER_TYPES } from './schemas';

/**
 * `photos` (DATABASE_DESIGN §5.12): published photos only. In-flight uploads live in
 * `photo_uploads`, so every gallery query is just `{ weddingId }` (DB-05).
 */
const photoSchema = new Schema(
  {
    weddingId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    eventId: { type: Schema.Types.ObjectId },
    displayKey: { type: String, required: true, immutable: true },
    thumbKey: { type: String, required: true, immutable: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    displayBytes: { type: Number, required: true },
    thumbBytes: { type: Number, required: true },
    mimeType: { type: String, required: true, enum: PHOTO_MIME_TYPES },
    uploaderType: { type: String, required: true, enum: UPLOADER_TYPES },
    uploaderUserId: { type: Schema.Types.ObjectId },
    uploaderName: { type: String, trim: true, maxlength: UPLOADER_NAME_MAX },
    featured: { type: Boolean, required: true, default: false },
    featuredAt: { type: Date },
  },
  { timestamps: true, versionKey: false, collection: 'photos' },
);
photoSchema.index({ weddingId: 1, createdAt: -1, _id: -1 });
photoSchema.index({ weddingId: 1, eventId: 1, createdAt: -1, _id: -1 });
photoSchema.index(
  { weddingId: 1, featuredAt: -1 },
  { partialFilterExpression: { featured: true } },
);
photoSchema.plugin(tenantGuard);

export type PhotoDoc = InferSchemaType<typeof photoSchema> & { _id: mongoose.Types.ObjectId };

export const Photo: Model<PhotoDoc> =
  (mongoose.models.Photo as Model<PhotoDoc>) ?? mongoose.model<PhotoDoc>('Photo', photoSchema);
