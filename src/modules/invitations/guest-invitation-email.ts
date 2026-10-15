import 'server-only';
import { createTranslator } from 'next-intl';
import { coupleNames } from '@/lib/couple';
import { formatCalendarDate } from '@/lib/dates';
import { escapeHtml, type Email } from '@/server/email/email';
import messages from '../../../messages/en.json';

/**
 * Email clients ignore CSS variables, so the brand values from src/styles/tokens.css are repeated
 * here as literals (plum, brass, ink, canvas). Keep them in step with the tokens.
 */
const PLUM = '#4a2943'; // --sh-brand-primary
const BRASS = '#715b37'; // --sh-brand-secondary-ink
const INK = '#181119'; // --sh-brand-ink
const MUTED = '#4e444a'; // --sh-brand-muted
const CANVAS = '#fbf8f5'; // --sh-brand-canvas
const PANEL = '#efe8dc'; // --sh-brand-panel
const LINE = '#e6ded4'; // --sh-brand-hairline
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = 'Arial, Helvetica, sans-serif';

type GuestInvitationEmail = {
  to: string;
  guestName: string;
  wedding: {
    brideName: string;
    groomName: string;
    nameOrder: 'BRIDE_FIRST' | 'GROOM_FIRST';
    weddingDate: string;
    city: string;
    rsvpDeadline?: string;
  };
  events: Array<{ name: string; date: string }>;
  inviteUrl: string;
};

/**
 * The guest invitation email (PRD §9.12, Stitch "Wedding Invitation" template): table layout and
 * inline styles for email clients, a text ornament instead of SVG (Gmail strips SVG), Georgia as the
 * serif. All copy from messages/en.json; every value is escaped.
 */
export function guestInvitationEmail(input: GuestInvitationEmail): Email {
  const t = createTranslator({ locale: 'en', messages, namespace: 'emails.guestInvitation' });
  const [first, second] = coupleNames(input.wedding);
  const date = formatCalendarDate(input.wedding.weddingDate, 'full');
  const deadline = input.wedding.rsvpDeadline
    ? formatCalendarDate(input.wedding.rsvpDeadline)
    : undefined;

  const subject = t('subject', { first, second });
  const greeting = t('greeting', { guest: input.guestName });
  const lead = t('lead', { first, second });
  const when = t('when', { date, city: input.wedding.city });
  const eventsTitle = t('eventsTitle');
  const action = t('action');
  const reply = deadline ? t('replyBy', { date: deadline }) : undefined;
  const footer = t('footer', { first, second });

  const eventLines = input.events.map(
    (event) => `- ${event.name}: ${formatCalendarDate(event.date, 'long')}`,
  );
  const text = [
    greeting,
    '',
    lead,
    when,
    '',
    ...(eventLines.length ? [eventsTitle, ...eventLines, ''] : []),
    `${action}: ${input.inviteUrl}`,
    ...(reply ? ['', reply] : []),
    '',
    footer,
  ].join('\n');

  const e = escapeHtml;
  const eventRows = input.events
    .map(
      (event) => `<tr>
<td style="padding:8px 0;border-top:1px solid ${LINE};font:15px ${SANS};color:${INK}">${e(event.name)}</td>
<td align="right" style="padding:8px 0;border-top:1px solid ${LINE};font:13px ${SANS};color:${MUTED};white-space:nowrap">${e(formatCalendarDate(event.date, 'long'))}</td>
</tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background:${CANVAS}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border:1px solid ${LINE};border-radius:16px">
<tr><td align="center" style="padding:40px 32px 8px">
<div style="font:20px ${SERIF};color:${BRASS}">&#10022;</div>
<div style="margin-top:8px;font:bold 11px ${SANS};letter-spacing:3px;color:${BRASS}">SHAADIOO</div>
<h1 style="margin:20px 0 0;font:normal 30px/1.2 ${SERIF};color:${PLUM}">${e(greeting)}</h1>
<p style="margin:16px 0 0;font:italic 19px/1.45 ${SERIF};color:${INK}">${e(lead)}</p>
<p style="margin:20px 0 0"><span style="display:inline-block;padding:8px 18px;border:1px solid ${LINE};border-radius:999px;background:${PANEL};font:14px ${SANS};color:${INK}">${e(when)}</span></p>
</td></tr>
${
  eventRows
    ? `<tr><td style="padding:24px 32px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PANEL};border-radius:12px"><tr><td style="padding:16px 20px">
<div style="font:bold 11px ${SANS};letter-spacing:2px;color:${MUTED};text-align:center;padding-bottom:6px">${e(eventsTitle.toUpperCase())}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${eventRows}</table>
</td></tr></table>
</td></tr>`
    : ''
}
<tr><td align="center" style="padding:28px 32px 0">
<a href="${e(input.inviteUrl)}" style="display:inline-block;padding:14px 28px;border-radius:12px;background:${PLUM};color:#FFFFFF;font:bold 16px ${SANS};text-decoration:none">${e(action)}</a>
${reply ? `<p style="margin:14px 0 0;font:14px ${SANS};color:${MUTED}">${e(reply)}</p>` : ''}
</td></tr>
<tr><td align="center" style="padding:28px 32px 36px">
<p style="margin:0;padding-top:20px;border-top:1px solid ${LINE};font:12px/1.5 ${SANS};color:${MUTED}">${e(footer)}</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { to: input.to, subject, text, html };
}
