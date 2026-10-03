import 'server-only';
import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { NAME_ORDERS } from './schemas';

/**
 * `weddings` (DATABASE_DESIGN §5.4), the tenant root. Not tenant-guarded: always addressed by its
 * own `_id` (from the membership) or by a public slug/token in unscoped.ts (§6.2, §6.3). Every
 * access path also checks `status: 'ACTIVE'`.
 */
const locationSchema = new Schema(
  {
    formattedAddress: { type: String, required: true, trim: true, maxlength: 300 },
    city: { type: String, required: true, trim: true, maxlength: 120 },
    state: { type: String, trim: true, maxlength: 80 },
    country: { type: String, trim: true, maxlength: 80, default: 'India' },
    lat: { type: Number },
    lng: { type: Number },
    googlePlaceId: { type: String, maxlength: 300 },
  },
  { _id: false },
);

const weddingSchema = new Schema(
  {
    status: { type: String, required: true, enum: ['ACTIVE', 'DELETING'], default: 'ACTIVE' },
    brideName: { type: String, required: true, trim: true, maxlength: 80 },
    groomName: { type: String, required: true, trim: true, maxlength: 80 },
    nameOrder: { type: String, required: true, enum: NAME_ORDERS, default: 'BRIDE_FIRST' },
    title: { type: String, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000 },
    weddingDate: { type: String, required: true },
    timezone: { type: String, required: true, default: 'Asia/Kolkata' },
    location: { type: locationSchema, required: true },
    coverImageKey: { type: String },
    rsvpDeadline: { type: String },
    website: {
      type: new Schema(
        {
          slug: { type: String, required: true, immutable: true },
          published: { type: Boolean, required: true, default: false },
          publishedAt: { type: Date },
          theme: {
            type: String,
            required: true,
            enum: ['CLASSIC', 'MINIMAL', 'MODERN'],
            default: 'CLASSIC',
          },
          welcomeMessage: { type: String, maxlength: 1000 },
        },
        { _id: false },
      ),
      required: true,
    },
    gallery: {
      type: new Schema(
        {
          // Never rotated, never returned by member APIs (SYSTEM §25).
          token: { type: String, required: true, immutable: true, select: false },
          guestViewEnabled: { type: Boolean, required: true, default: true },
          guestUploadEnabled: { type: Boolean, required: true, default: true },
        },
        { _id: false },
      ),
      required: true,
    },
    livestream: {
      type: new Schema(
        {
          youtubeVideoId: { type: String, required: true },
          sourceUrl: { type: String, required: true },
        },
        { _id: false },
      ),
    },
    counters: {
      type: new Schema(
        {
          adminCount: { type: Number, required: true, default: 1 },
          photoSlotsUsed: { type: Number, required: true, default: 0 },
          featuredPhotoCount: { type: Number, required: true, default: 0 },
        },
        { _id: false },
      ),
      required: true,
      default: () => ({}),
    },
    uploadStats: {
      type: new Schema(
        {
          requested: { type: Number, required: true, default: 0 },
          published: { type: Number, required: true, default: 0 },
          failed: { type: Number, required: true, default: 0 },
        },
        { _id: false },
      ),
      required: true,
      default: () => ({}),
    },
    photosPurgedAt: { type: Date },
    deletionRequestedAt: { type: Date },
    deletionRequestedBy: { type: Schema.Types.ObjectId },
    createdByUserId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  },
  { timestamps: true, versionKey: false, collection: 'weddings' },
);
weddingSchema.index({ 'website.slug': 1 }, { unique: true });
weddingSchema.index({ 'gallery.token': 1 }, { unique: true });
weddingSchema.index({ status: 1 });
weddingSchema.index({ weddingDate: 1 });

export type WeddingDoc = InferSchemaType<typeof weddingSchema> & { _id: mongoose.Types.ObjectId };

export const Wedding: Model<WeddingDoc> =
  (mongoose.models.Wedding as Model<WeddingDoc>) ??
  mongoose.model<WeddingDoc>('Wedding', weddingSchema);
