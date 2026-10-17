import 'server-only';
import type { Types } from 'mongoose';
import type { z } from 'zod';
import { coupleNames } from '@/lib/couple';
import { recordActivity } from '@/modules/activity';
import { websiteEvents } from '@/modules/events';
import { websiteGlimpse } from '@/modules/gallery';
import { connectDb } from '@/server/db/connection';
import { withTransaction } from '@/server/db/transaction';
import { findPublishedWeddingIdBySlug } from '@/server/db/unscoped';
import { env } from '@/server/env';
import { AppError } from '@/server/http/errors';
import { optionalPublicUrl } from '@/server/storage/storage';
import type { PublicWebsite, updateWebsiteSchema, WebsiteResponse } from './schemas';
import { Wedding, type WeddingDoc } from './wedding.model';

type WebsiteCtx = {
  weddingId: Types.ObjectId;
  userId: Types.ObjectId;
  user: { name: string };
};

type UpdateWebsite = z.output<typeof updateWebsiteSchema>;

const ACTIVE = 'ACTIVE' as const;

function noWedding(): AppError {
  return new AppError('NO_WEDDING', 'You are not part of a wedding.');
}

/** The public address of a website (API_DESIGN §20 `url`). */
export function websiteUrl(slug: string): string {
  return `${env().APP_ORIGIN}/w/${slug}`;
}

function toWebsiteResponse(
  doc: Pick<WeddingDoc, 'website' | 'counters' | 'livestream'>,
): WebsiteResponse {
  const { website } = doc;
  return {
    url: websiteUrl(website.slug),
    published: website.published,
    ...(website.publishedAt ? { publishedAt: website.publishedAt.toISOString() } : {}),
    theme: website.theme,
    ...(website.welcomeMessage ? { welcomeMessage: website.welcomeMessage } : {}),
    featuredPhotoCount: doc.counters.featuredPhotoCount,
    ...(doc.livestream
      ? {
          livestream: {
            youtubeVideoId: doc.livestream.youtubeVideoId,
            sourceUrl: doc.livestream.sourceUrl,
          },
        }
      : {}),
  };
}

const WEBSITE_FIELDS = { website: 1, counters: 1, livestream: 1 } as const;

/** `GET /api/website` (API_DESIGN §20): any member. */
export async function getWebsite(ctx: { weddingId: Types.ObjectId }): Promise<WebsiteResponse> {
  await connectDb();
  const doc = await Wedding.findOne({ _id: ctx.weddingId, status: ACTIVE }, WEBSITE_FIELDS).lean();
  if (!doc) throw noWedding();
  return toWebsiteResponse(doc);
}

/**
 * `PATCH /api/website` (API_DESIGN §20): theme and welcome message. One targeted update; a cleared
 * message is `$unset`, never stored as null. Not logged (DATABASE_DESIGN §5.15 has no action).
 */
export async function updateWebsite(
  ctx: { weddingId: Types.ObjectId },
  input: UpdateWebsite,
): Promise<WebsiteResponse> {
  await connectDb();
  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};
  if (input.theme !== undefined) set['website.theme'] = input.theme;
  if (input.welcomeMessage === null) unset['website.welcomeMessage'] = '';
  else if (input.welcomeMessage !== undefined) set['website.welcomeMessage'] = input.welcomeMessage;

  const doc = await Wedding.findOneAndUpdate(
    { _id: ctx.weddingId, status: ACTIVE },
    {
      ...(Object.keys(set).length ? { $set: set } : {}),
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    },
    { returnDocument: 'after', runValidators: true, projection: WEBSITE_FIELDS },
  ).lean();
  if (!doc) throw noWedding();
  return toWebsiteResponse(doc);
}

/**
 * `POST /api/website/publish` and `/unpublish` (API_DESIGN §20). The current state is in the update
 * filter, so a repeat is a no-op that logs nothing; a real change is logged in the same transaction
 * (`website.published` / `website.unpublished`). Unpublishing takes effect on the next request.
 */
export async function setWebsitePublished(
  ctx: WebsiteCtx,
  published: boolean,
): Promise<WebsiteResponse> {
  await connectDb();
  await withTransaction(async (session) => {
    const changed = await Wedding.findOneAndUpdate(
      { _id: ctx.weddingId, status: ACTIVE, 'website.published': !published },
      published
        ? { $set: { 'website.published': true, 'website.publishedAt': new Date() } }
        : { $set: { 'website.published': false }, $unset: { 'website.publishedAt': '' } },
      { session, projection: { brideName: 1, groomName: 1, nameOrder: 1 } },
    ).lean();
    if (!changed) return;
    await recordActivity(session, {
      weddingId: ctx.weddingId,
      actor: { userId: ctx.userId, name: ctx.user.name },
      action: published ? 'website.published' : 'website.unpublished',
      target: { type: 'website', label: coupleNames(changed).join(' & ') },
    });
  });
  return getWebsite(ctx);
}

/**
 * The public website behind a slug (DATABASE_DESIGN §6.3 #4, SYSTEM_DESIGN §26), or undefined for
 * a draft, deleting or unknown wedding. Only published fields are read: no guests, members,
 * tokens, counters or exact address.
 */
export async function findPublicWebsite(slug: string): Promise<PublicWebsite | undefined> {
  const weddingId = await findPublishedWeddingIdBySlug(slug);
  if (!weddingId) return undefined;
  await connectDb();
  const doc = await Wedding.findOne(
    { _id: weddingId, status: ACTIVE, 'website.published': true },
    {
      _id: 0,
      brideName: 1,
      groomName: 1,
      nameOrder: 1,
      title: 1,
      description: 1,
      weddingDate: 1,
      'location.city': 1,
      'website.theme': 1,
      'website.welcomeMessage': 1,
      coverImageKey: 1,
    },
  ).lean();
  if (!doc) return undefined;
  const [events, glimpse] = await Promise.all([
    websiteEvents({ weddingId }),
    websiteGlimpse({ weddingId }),
  ]);
  const coverImageUrl = optionalPublicUrl(doc.coverImageKey);
  return {
    brideName: doc.brideName,
    groomName: doc.groomName,
    nameOrder: doc.nameOrder,
    ...(doc.title ? { title: doc.title } : {}),
    ...(doc.description ? { description: doc.description } : {}),
    weddingDate: doc.weddingDate,
    city: doc.location.city,
    theme: doc.website.theme,
    ...(doc.website.welcomeMessage ? { welcomeMessage: doc.website.welcomeMessage } : {}),
    ...(coverImageUrl ? { coverImageUrl } : {}),
    events,
    glimpse,
  };
}
