/**
 * Browser-side calls to our own /api routes (API_DESIGN §4). Never throws: a failure comes back as
 * the envelope's `code`, so forms can show a translated message for it. The server `message` is
 * deliberately dropped — UI text comes from messages/en.json, keyed by code.
 */

/** Not a server code: the request never got a response (offline, DNS, aborted). */
export const NETWORK_ERROR = 'NETWORK_ERROR';

export type ApiFailure = {
  ok: false;
  code: string;
  details?: unknown;
  /** Shown to the user for bug reports (API §4.2). Absent for NETWORK_ERROR. */
  requestId?: string;
};

export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

type ErrorEnvelope = { error?: { code?: unknown; details?: unknown; requestId?: unknown } };

export async function postJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    return { ok: false, code: NETWORK_ERROR };
  }

  if (res.ok) {
    if (res.status === 204) return { ok: true, data: undefined as T };
    try {
      return { ok: true, data: (await res.json()) as T };
    } catch {
      // A 2xx that is not JSON (a proxy's HTML page, an empty body) is a server fault, not success.
      const requestId = res.headers.get('X-Request-Id');
      return { ok: false, code: 'INTERNAL_ERROR', ...(requestId ? { requestId } : {}) };
    }
  }

  const envelope = (await res.json().catch(() => null)) as ErrorEnvelope | null;
  const error = envelope?.error;
  const requestId =
    typeof error?.requestId === 'string' ? error.requestId : res.headers.get('X-Request-Id');
  return {
    ok: false,
    code: typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR',
    ...(error?.details === undefined ? {} : { details: error.details }),
    ...(requestId ? { requestId } : {}),
  };
}

/** Whole minutes to wait after a RATE_LIMITED response, at least 1. */
export function retryAfterMinutes(details: unknown): number {
  const seconds = (details as { retryAfterSeconds?: unknown } | undefined)?.retryAfterSeconds;
  return typeof seconds === 'number' && seconds > 0 ? Math.ceil(seconds / 60) : 1;
}
