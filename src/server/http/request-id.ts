import 'server-only';

/** Unique per request; returned as X-Request-Id and in every error body (API_DESIGN §4.2). */
export function newRequestId(): string {
  return crypto.randomUUID();
}
