'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, buttonClasses } from '@/components/ui/button';
import { ChatIcon, CheckCircleIcon, CopyIcon, MailIcon } from '@/components/ui/icons';
import { whatsAppUrl } from '@/lib/whatsapp';
import type { SentMemberInvitation } from '@/modules/members/schemas';

/**
 * After inviting or resending (PRD §9.4): the email went out (or could not), and the link is shown
 * this once to share on WhatsApp or copy, so the Admin chooses how to send it.
 */
export function InvitationSent({
  sent,
  inviterName,
  couple,
  onDone,
}: {
  sent: SentMemberInvitation;
  inviterName: string;
  couple: readonly [string, string];
  onDone: () => void;
}) {
  const t = useTranslations('members.settings.members.sent');
  const tRoles = useTranslations('members.settings.members.roles');
  const [copied, setCopied] = useState<'yes' | 'failed'>();
  const inputRef = useRef<HTMLInputElement>(null);

  const message = t('message', {
    inviter: inviterName,
    first: couple[0],
    second: couple[1],
    role: tRoles(sent.role),
    url: sent.joinUrl,
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(sent.joinUrl);
      setCopied('yes');
    } catch {
      inputRef.current?.select();
      setCopied('failed');
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success">
          <CheckCircleIcon width={20} height={20} />
        </span>
        <div>
          <h2 id="invite-dialog-title" className="font-display text-headline-sm text-ink">
            {t('title')}
          </h2>
          <p
            role="status"
            className={`mt-1 flex items-start gap-1.5 text-body ${sent.emailSent ? 'text-ink-muted' : 'text-danger'}`}
          >
            <MailIcon width={16} height={16} className="mt-0.5 shrink-0" />
            <span className="break-words">
              {sent.emailSent
                ? t('emailSent', { email: sent.email })
                : t('emailNotSent', { email: sent.email })}
            </span>
          </p>
        </div>
      </div>

      <a
        href={whatsAppUrl(undefined, message)}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClasses()}
      >
        <ChatIcon width={18} height={18} />
        {t('whatsapp')}
      </a>

      <div className="flex flex-col gap-2">
        <label htmlFor="join-url" className="text-body font-medium text-ink">
          {t('linkLabel')}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            ref={inputRef}
            id="join-url"
            readOnly
            value={sent.joinUrl}
            onFocus={(event) => event.target.select()}
            className="h-11 min-w-0 flex-1 rounded-control border border-line bg-canvas-muted px-3.5 text-body text-ink"
          />
          <Button variant="outline" onClick={copy}>
            <CopyIcon width={16} height={16} />
            {t('copy')}
          </Button>
        </div>
        <p role="status" className="min-h-5 text-label">
          {copied === 'yes' && (
            <span className="inline-flex items-center gap-1.5 font-medium text-success">
              <CheckCircleIcon width={14} height={14} />
              {t('copied')}
            </span>
          )}
          {copied === 'failed' && <span className="text-danger">{t('copyFailed')}</span>}
        </p>
        <p className="rounded-control bg-pending px-3.5 py-2.5 text-label text-on-pending">
          {t('linkNote')}
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={onDone}>{t('done')}</Button>
      </div>
    </div>
  );
}
