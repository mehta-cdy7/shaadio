import 'server-only';
import type { Types } from 'mongoose';
import { assertEventsExist, getEvent, setEventCover } from '@/modules/events';
import { getWedding, setWeddingCover } from '@/modules/weddings';
import { signValue, verifyValue } from '@/server/auth/signed';
import { AppError } from '@/server/http/errors';
import { coverKey, newKeyId, stagingKeys } from '@/server/storage/keys';
import {
  copyObject,
  deleteObjects,
  headObject,
  readObjectStart,
  signUploadUrl,
  UPLOAD_URL_SECONDS,
} from '@/server/storage/storage';
import { sniffImageType } from './format';
import type {
  CoverTarget,
  CoverUploadRequestInput,
  CoverUploadResponse,
  PhotoMimeType,
} from './schemas';

/**
 * Wedding and event cover images (API_DESIGN §23): the photo upload pattern without a database
 * reservation. The upload request returns a signed ticket naming the wedding, target, staging key
 * and declared size; `complete` trusts only what it signed, verifies the stored bytes, copies them
 * under `covers/` and swaps the key, then deletes the previous cover.
 */

const PURPOSE = 'cover-upload';

type Ticket = {
  w: string; // wedding id
  t: CoverTarget;
  e?: string; // event id
  k: string; // key id
  m: PhotoMimeType;
  b: number; // bytes
};

type Scope = { weddingId: Types.ObjectId };

function unusable(reason: string): AppError {
  return new AppError('VALIDATION_ERROR', 'This image could not be used. Please upload it again.', {
    fields: { ticket: reason },
  });
}

async function removeQuietly(keys: string[]): Promise<void> {
  try {
    await deleteObjects(keys);
  } catch {
    console.error('[gallery] cover cleanup failed', { count: keys.length });
  }
}

/** `POST /api/covers/upload-request`. */
export async function requestCoverUpload(
  scope: Scope,
  input: CoverUploadRequestInput,
): Promise<CoverUploadResponse> {
  if (input.target === 'EVENT') await assertEventsExist(scope, [input.eventId!], 'eventId');
  const keyId = newKeyId();
  const wedding = scope.weddingId.toHexString();
  const staging = stagingKeys(wedding, keyId).display;
  const expiresAt = new Date(Date.now() + UPLOAD_URL_SECONDS * 1000);
  const ticket: Ticket = {
    w: wedding,
    t: input.target,
    ...(input.eventId ? { e: input.eventId.toLowerCase() } : {}),
    k: keyId,
    m: input.mimeType,
    b: input.bytes,
  };
  return {
    ticket: signValue(PURPOSE, ticket, expiresAt),
    putUrl: await signUploadUrl(staging, input.mimeType, input.bytes),
    expiresAt: expiresAt.toISOString(),
  };
}

/** `POST /api/covers/complete`: the updated Wedding or Event. */
export async function completeCoverUpload(scope: Scope, signed: string) {
  const ticket = verifyValue<Ticket>(PURPOSE, signed);
  // Another wedding's ticket is as unusable as a forged one.
  if (!ticket || ticket.w !== scope.weddingId.toHexString()) throw unusable('INVALID');

  const staging = stagingKeys(ticket.w, ticket.k).display;
  const head = await headObject(staging);
  if (!head) throw unusable('MISSING_OBJECT');
  if (head.size !== ticket.b) {
    await removeQuietly([staging]);
    throw unusable('TOO_LARGE');
  }
  const start = await readObjectStart(staging, 16, head.etag);
  if (!start || sniffImageType(start) !== ticket.m) {
    await removeQuietly([staging]);
    throw unusable('NOT_AN_IMAGE');
  }

  const key = coverKey(ticket.w, ticket.k);
  await copyObject(staging, key, ticket.m, head.etag);
  let previous: string | undefined;
  try {
    previous =
      ticket.t === 'EVENT'
        ? await setEventCover(scope, ticket.e!, key)
        : await setWeddingCover(scope, key);
  } catch (error) {
    // The event was deleted meanwhile: nothing points at the copy.
    await removeQuietly([key, staging]);
    throw error;
  }
  await removeQuietly([staging, ...(previous && previous !== key ? [previous] : [])]);
  return ticket.t === 'EVENT' ? getEvent(scope, ticket.e!) : getWedding(scope);
}

/** `DELETE /api/covers`: clears the key, then deletes the object. */
export async function deleteCover(
  scope: Scope,
  target: CoverTarget,
  eventId?: string,
): Promise<void> {
  const previous =
    target === 'EVENT'
      ? await setEventCover(scope, eventId!, undefined)
      : await setWeddingCover(scope, undefined);
  if (previous) await removeQuietly([previous]);
}
