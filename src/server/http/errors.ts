import 'server-only';

/** Error codes and their HTTP statuses (API_DESIGN §4.3). Clients switch on `code`. */
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  NO_WEDDING: 403,
  INVITE_EMAIL_MISMATCH: 403,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  CONFLICT: 409,
  EMAIL_TAKEN: 409,
  ALREADY_MEMBER: 409,
  INVITATION_PENDING: 409,
  INVITATION_EXPIRED: 409,
  LAST_ADMIN: 409,
  VERSION_CONFLICT: 409,
  BELOW_CONFIRMED: 409,
  CAPACITY_EXCEEDED: 409,
  RSVP_LOCKED: 409,
  NO_EVENTS: 409,
  LIMIT_REACHED: 409,
  GALLERY_FULL: 409,
  FEATURED_LIMIT: 409,
  UPLOADS_DISABLED: 409,
  VENDOR_EXISTS: 409,
  CONFIRMATION_MISMATCH: 409,
  EMAIL_QUOTA_EXHAUSTED: 503,
  EMAIL_PROVIDER_ERROR: 502,
  DISCOVERY_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export type ErrorBody = {
  error: { code: ErrorCode; message: string; details?: unknown; requestId: string };
};

/** An expected failure. `message` must be safe to show: no stack traces, tokens or other weddings' data. */
export class AppError extends Error {
  override name = 'AppError';

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Maps any thrown value to the API error envelope. Unexpected errors never leak their message. */
export function errorResponse(error: unknown, requestId: string): Response {
  const appError =
    error instanceof AppError
      ? error
      : new AppError('INTERNAL_ERROR', 'Something went wrong. Please try again.');

  const body: ErrorBody = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details === undefined ? {} : { details: appError.details }),
      requestId,
    },
  };

  return Response.json(body, {
    status: ERROR_STATUS[appError.code],
    headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId },
  });
}
