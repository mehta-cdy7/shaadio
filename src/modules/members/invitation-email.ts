import 'server-only';
import { createTranslator } from 'next-intl';
import { coupleNames } from '@/lib/couple';
import { escapeHtml, type Email } from '@/server/email/email';
import messages from '../../../messages/en.json';
import { INVITATION_DAYS, type Role } from './schemas';

type InvitationEmail = {
  to: string;
  inviterName: string;
  role: Role;
  joinUrl: string;
  wedding: { brideName: string; groomName: string; nameOrder: 'BRIDE_FIRST' | 'GROOM_FIRST' };
};

/** The member invitation email (PRD §9.4, SYSTEM_DESIGN §19), text and HTML, from messages/en.json. */
export function memberInvitationEmail(input: InvitationEmail): Email {
  const t = createTranslator({ locale: 'en', messages, namespace: 'emails.memberInvitation' });
  const [first, second] = coupleNames(input.wedding);
  const values = {
    inviter: input.inviterName,
    first,
    second,
    role: t(`roles.${input.role}`),
    days: INVITATION_DAYS,
  };
  const subject = t('subject', values);
  const intro = t('intro', values);
  const roleLine = t('roleLine', values);
  const action = t('action');
  const expiry = t('expiry', values);
  const ignore = t('ignore');

  const text = [intro, '', roleLine, '', `${action}: ${input.joinUrl}`, '', expiry, ignore].join(
    '\n',
  );
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;line-height:1.5">
<p>${escapeHtml(intro)}</p>
<p>${escapeHtml(roleLine)}</p>
<p><a href="${escapeHtml(input.joinUrl)}">${escapeHtml(action)}</a></p>
<p style="font-size:13px">${escapeHtml(expiry)}<br>${escapeHtml(ignore)}</p>
</body></html>`;

  return { to: input.to, subject, text, html };
}
