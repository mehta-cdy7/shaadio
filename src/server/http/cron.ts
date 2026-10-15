import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { cronSecret } from '@/server/env';
import { AppError } from './errors';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * `/api/internal/*` accepts only `Authorization: Bearer <CRON_SECRET>`, compared in constant time
 * (API_DESIGN §2.3, SYSTEM_DESIGN §54). Without a configured secret every request is refused.
 * Both values are hashed first so the comparison never depends on their lengths.
 */
export function assertCron(req: Request): void {
  const secret = cronSecret();
  const header = req.headers.get('authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!secret || !given || !timingSafeEqual(digest(given), digest(secret))) {
    throw new AppError('UNAUTHENTICATED', 'Not allowed.');
  }
}
