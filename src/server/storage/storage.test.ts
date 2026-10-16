import { NotFound, S3Client } from '@aws-sdk/client-s3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  copyObject,
  deleteObjects,
  deletePrefix,
  headObject,
  publicUrl,
  signUploadUrl,
  StorageNotConfiguredError,
  storageConfigured,
} from './storage';

const ENV = {
  R2_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
  R2_ACCESS_KEY_ID: 'access-key',
  R2_SECRET_ACCESS_KEY: 'secret-key',
  R2_BUCKET_NAME: 'shaadio-test',
  MEDIA_BASE_URL: 'https://media.shaadio.example',
};

type Sent = { constructor: { name: string }; input: Record<string, unknown> };

function stubR2() {
  for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
}

describe('storage adapter', () => {
  let sent: Sent[];
  let reply: (command: Sent) => unknown;

  beforeEach(() => {
    sent = [];
    reply = () => ({});
    vi.spyOn(S3Client.prototype, 'send').mockImplementation(async (command: unknown) => {
      sent.push(command as Sent);
      return reply(command as Sent) as never;
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('is off, and refuses to run, without R2 variables', async () => {
    for (const key of Object.keys(ENV)) vi.stubEnv(key, '');
    expect(storageConfigured()).toBe(false);
    await expect(headObject('k')).rejects.toBeInstanceOf(StorageNotConfiguredError);
    expect(() => publicUrl('k')).toThrow(StorageNotConfiguredError);
  });

  it('signs a PUT bound to the content type and length, for one hour', async () => {
    stubR2();
    const url = new URL(await signUploadUrl('staging/w/k/d', 'image/webp', 1234));
    expect(url.host).toBe(`${ENV.R2_BUCKET_NAME}.${ENV.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
    expect(url.pathname).toBe('/staging/w/k/d');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('3600');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host');
    expect(url.search).not.toContain(ENV.R2_SECRET_ACCESS_KEY);
  });

  it('reports a missing object as undefined', async () => {
    stubR2();
    reply = () => {
      throw new NotFound({ message: 'not found', $metadata: {} });
    };
    await expect(headObject('missing')).resolves.toBeUndefined();
  });

  it('reads size and type of an object', async () => {
    stubR2();
    reply = () => ({ ContentLength: 42, ContentType: 'image/webp' });
    await expect(headObject('k')).resolves.toEqual({ size: 42, contentType: 'image/webp' });
  });

  it('copies with the final type and an immutable cache header', async () => {
    stubR2();
    await copyObject('staging/w/k/d', 'weddings/w/photos/k/d.webp', 'image/webp');
    expect(sent[0]?.input).toMatchObject({
      Bucket: ENV.R2_BUCKET_NAME,
      CopySource: `${ENV.R2_BUCKET_NAME}/staging/w/k/d`,
      Key: 'weddings/w/photos/k/d.webp',
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    });
  });

  it('deletes in batches of 1,000 and fails loudly on errors', async () => {
    stubR2();
    const keys = Array.from({ length: 2500 }, (_, i) => `k${i}`);
    await deleteObjects(keys);
    expect(sent.map((c) => (c.input.Delete as { Objects: unknown[] }).Objects.length)).toEqual([
      1000, 1000, 500,
    ]);

    reply = () => ({ Errors: [{ Key: 'k0', Code: 'InternalError' }] });
    await expect(deleteObjects(['k0'])).rejects.toThrow(/delete failed/);
  });

  it('deletes everything under a prefix, page by page', async () => {
    stubR2();
    let page = 0;
    reply = (command) => {
      if (command.constructor.name !== 'ListObjectsV2Command') return {};
      page += 1;
      return page === 1
        ? { Contents: [{ Key: 'weddings/w/a' }], IsTruncated: true, NextContinuationToken: 't' }
        : { Contents: [{ Key: 'weddings/w/b' }], IsTruncated: false };
    };
    await expect(deletePrefix('weddings/w/')).resolves.toBe(2);
    expect(
      sent.filter((c) => c.constructor.name === 'ListObjectsV2Command')[1]?.input,
    ).toMatchObject({ Prefix: 'weddings/w/', ContinuationToken: 't' });
    await expect(deletePrefix('weddings/w')).rejects.toThrow(/must end with/);
  });

  it('builds public URLs on the media domain', () => {
    stubR2();
    expect(publicUrl('weddings/w/photos/k/d.webp')).toBe(
      'https://media.shaadio.example/weddings/w/photos/k/d.webp',
    );
  });
});
