import 'server-only';
import { Resend } from 'resend';
import { emailEnv } from '@/server/env';
import { giveBack, takeTransactional } from './quota';

export type Email = { to: string; subject: string; text: string; html: string };

/**
 * Sends one transactional email through Resend (SYSTEM_DESIGN §4). Never throws and never logs the
 * recipient or body (they can carry tokens, API_DESIGN §8.2): the caller only learns whether it
 * was accepted, so a failed send cannot undo the change that triggered it.
 * Never call this inside a database transaction (DATABASE_DESIGN §8).
 */
export async function sendEmail(email: Email, kind: string): Promise<boolean> {
  const config = emailEnv();
  if (!config) {
    console.warn('[email] not configured, skipped', { kind });
    return false;
  }
  try {
    const { error } = await new Resend(config.RESEND_API_KEY).emails.send({
      from: config.EMAIL_FROM,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    if (error) {
      console.error('[email] provider rejected', { kind, error: error.name });
      return false;
    }
    return true;
  } catch (error) {
    console.error('[email] send failed', {
      kind,
      error: error instanceof Error ? error.name : 'unknown',
    });
    return false;
  }
}

/**
 * A transactional email (member invitation, password reset) within today's budget (SYSTEM §51):
 * false when the daily limit is used up or the send fails; a failed send is given back.
 */
export async function sendTransactional(email: Email, kind: string): Promise<boolean> {
  if (!emailEnv()) return sendEmail(email, kind);
  if (!(await takeTransactional())) {
    console.warn('[email] daily limit reached, skipped', { kind });
    return false;
  }
  const sent = await sendEmail(email, kind);
  if (!sent) await giveBack(1);
  return sent;
}

export type BatchResult = { ok: true; ids: string[] } | { ok: false; error: string };

/**
 * Sends up to 100 emails in one provider call (SYSTEM_DESIGN §49). The idempotency key makes a
 * retried call after a timeout a no-op at the provider. Never throws; logs only `kind` and the
 * error class. `ids` are in the order of `emails`.
 */
export async function sendEmailBatch(
  emails: Email[],
  kind: string,
  idempotencyKey: string,
): Promise<BatchResult> {
  const config = emailEnv();
  if (!config) {
    console.warn('[email] not configured, batch skipped', { kind, count: emails.length });
    return { ok: false, error: 'NOT_CONFIGURED' };
  }
  try {
    const { data, error } = await new Resend(config.RESEND_API_KEY).batch.send(
      emails.map((email) => ({
        from: config.EMAIL_FROM,
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
      })),
      { idempotencyKey },
    );
    if (error || !data) {
      console.error('[email] provider rejected batch', { kind, error: error?.name ?? 'unknown' });
      return { ok: false, error: error?.name ?? 'PROVIDER_ERROR' };
    }
    return { ok: true, ids: data.data.map((item) => item.id) };
  } catch (error) {
    const name = error instanceof Error ? error.name : 'unknown';
    console.error('[email] batch failed', { kind, error: name });
    return { ok: false, error: name };
  }
}

/** Escapes text for an HTML email body. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
