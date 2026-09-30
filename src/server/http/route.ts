import 'server-only';
import type { z } from 'zod';
import { env } from '@/server/env';
import { AppError, errorResponse } from './errors';
import { newRequestId } from './request-id';

/** Everything else is capped at 64 KB (API_DESIGN §8.3). */
const MAX_BODY_BYTES = 64 * 1024;

export type RequestMeta = { requestId: string };

/**
 * Wraps a route handler: assigns the request id, maps thrown errors to the error envelope, and adds
 * `Cache-Control: no-store` and `X-Request-Id` to every response (API_DESIGN §4, §8.1).
 * `route` is the route pattern, the only path that is ever logged (API_DESIGN §8.2).
 */
export function handler(
  route: string,
  fn: (req: Request, meta: RequestMeta) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    const requestId = newRequestId();
    let res: Response;
    try {
      res = await fn(req, { requestId });
    } catch (error) {
      if (!(error instanceof AppError)) {
        // Class name only: messages can carry request data.
        console.error('[api] unhandled error', {
          route,
          method: req.method,
          requestId,
          error: error instanceof Error ? error.name : 'unknown',
        });
      }
      return errorResponse(error, requestId);
    }
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('X-Request-Id', requestId);
    return res;
  };
}

/**
 * CSRF layers 2 and 3 (API_DESIGN §2.2): a mutating request must come from the app origin and be
 * JSON. Then the body is size-capped, parsed and validated with a strict Zod schema.
 */
export async function readJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  if (req.headers.get('origin') !== env().APP_ORIGIN) {
    throw new AppError('FORBIDDEN', 'This request is not allowed.');
  }
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.split(';')[0]!.trim().toLowerCase() !== 'application/json') {
    throw new AppError('VALIDATION_ERROR', 'Requests must be JSON.');
  }
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) throw tooLarge();

  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw tooLarge();

  let body: unknown;
  try {
    body = text === '' ? {} : JSON.parse(text);
  } catch {
    throw new AppError('VALIDATION_ERROR', 'The request body is not valid JSON.');
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join('.') || '_';
      fields[path] ??= issue.message;
    }
    throw new AppError('VALIDATION_ERROR', 'Some fields are invalid.', { fields });
  }
  return result.data;
}

function tooLarge(): AppError {
  return new AppError('PAYLOAD_TOO_LARGE', 'The request body is too large.');
}

/** Client IP from Vercel's header (API_DESIGN §7). */
export function clientIp(req: Request): string {
  return req.headers.get('x-real-ip') ?? 'unknown';
}
