/**
 * `pnpm r2:check`: proves an R2 setup works end to end before any feature relies on it. Reads the
 * same variables as src/server/storage (from .env.local, or the shell for production values):
 *
 *   1. signs a PUT the way the app does and uploads a tiny object through it, as a browser would;
 *   2. checks the bucket's CORS answers a browser preflight from APP_ORIGIN;
 *   3. reads the object back from MEDIA_BASE_URL (the public media domain);
 *   4. deletes it.
 *
 * Plain Node (type stripping), outside the Next build: it cannot import src/server, whose files
 * start with `import 'server-only'`. Never prints credentials or signed URLs.
 */
import { randomBytes } from 'node:crypto';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const REQUIRED = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'MEDIA_BASE_URL',
  'APP_ORIGIN',
] as const;

function config(): Record<(typeof REQUIRED)[number], string> {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing: ${missing.join(', ')}`);
  return Object.fromEntries(REQUIRED.map((key) => [key, process.env[key]!])) as never;
}

function step(ok: boolean, label: string, hint?: string): void {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !hint ? '' : `\n      → ${hint}`}`);
  if (!ok) process.exitCode = 1;
}

async function main(): Promise<void> {
  const env = config();
  console.log(`r2:check → bucket ${env.R2_BUCKET_NAME}`);
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  const key = `staging/r2-check/${randomBytes(16).toString('base64url')}`;
  const body = new TextEncoder().encode('shaadio r2 check');
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      ContentType: 'text/plain',
      ContentLength: body.length,
    }),
    { expiresIn: 300, signableHeaders: new Set(['content-type', 'content-length']) },
  );

  let uploaded = false;
  try {
    const put = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body,
    });
    uploaded = put.ok;
    step(
      put.ok,
      `upload through a signed URL (${put.status})`,
      'check the API token has Object Read & Write on this bucket, and the account id',
    );

    const preflight = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        Origin: env.APP_ORIGIN,
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    const allowed = preflight.headers.get('access-control-allow-origin');
    step(
      allowed === env.APP_ORIGIN || allowed === '*',
      `browser upload allowed from ${env.APP_ORIGIN} (CORS)`,
      'add a CORS rule on the bucket: AllowedOrigins [APP_ORIGIN], AllowedMethods [PUT, GET], AllowedHeaders [content-type]',
    );

    if (uploaded) {
      const read = await fetch(`${env.MEDIA_BASE_URL}/${key}`);
      step(
        read.ok && (await read.text()) === 'shaadio r2 check',
        `read back from ${env.MEDIA_BASE_URL} (${read.status})`,
        'connect a custom domain (or r2.dev URL) to this bucket and set MEDIA_BASE_URL to it',
      );
    }
  } finally {
    if (uploaded) {
      await client.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }));
      step(true, 'deleted the test object');
    }
  }
  console.log(process.exitCode ? 'r2:check failed' : 'r2:check passed');
}

main().catch((error: unknown) => {
  console.error(`r2:check failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
