import 'server-only';
import { Resend } from 'resend';
import { emailEnv } from '@/server/env';

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

/** Escapes text for an HTML email body. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
