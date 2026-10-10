import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/button';
import { AlertIcon, CalendarIcon, ClockIcon } from '@/components/ui/icons';
import { currentUser } from '@/app/_lib/current-user';
import { coupleNames } from '@/lib/couple';
import { previewMemberInvitation } from '@/modules/members';
import { isWeddingEmpty, resolveMember } from '@/modules/weddings';
import { SignOutButton } from '../../../(members)/_components/sign-out-button';
import { AuthShell } from '../../_components/auth-shell';
import { CeremonyArch } from '../../_components/ceremony-arch';
import { JoinButton } from './_components/join-button';
import { JoinSignupForm } from './_components/join-signup-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.join');
  // The token is in the URL: never indexed, never sent on as a Referer (API_DESIGN §8.1).
  return {
    title: t('metaTitle'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

/**
 * Join a wedding by member invitation (PRD §9.4, SYSTEM_DESIGN §19, Stitch "Join by Invitation"):
 * create an account and join, join while signed in, or one of the dead ends (expired, another
 * account, already in a wedding, invalid). Possession of the link is the access; the preview shows
 * only who invited whom.
 */
export default async function JoinPage({ params }: PageProps<'/join/[token]'>) {
  const { token } = await params;
  const t = await getTranslations('auth.join');
  const [preview, session] = await Promise.all([previewMemberInvitation(token), currentUser()]);

  if (!preview) {
    return (
      <AuthShell aside={<CeremonyArch />}>
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-fill text-ink-muted">
            <AlertIcon width={24} height={24} />
          </span>
          <p className="text-label-sm font-semibold tracking-widest text-ink-muted uppercase">
            {t('invalid.eyebrow')}
          </p>
          <h1 className="font-display text-headline-lg-sm text-ink">{t('invalid.title')}</h1>
          <p className="text-body-lg text-ink-muted">{t('invalid.body')}</p>
          <ButtonLink href="/" className="mt-2">
            {t('invalid.home')}
          </ButtonLink>
        </div>
      </AuthShell>
    );
  }

  const [first, second] = coupleNames(preview.wedding);
  const role = t(`roles.${preview.role}`);
  const header = (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-label-sm font-semibold tracking-widest text-ink-accent uppercase">
        <span aria-hidden="true" className="size-1.5 rotate-45 bg-secondary-ink" />
        {t('eyebrow')}
      </p>
      <h1 className="font-display text-headline-lg-sm text-balance text-ink md:text-headline-lg">
        {t('wedding', { first, second })}
      </h1>
      <p className="rounded-control bg-canvas-muted px-4 py-3 text-body text-ink">
        {preview.label
          ? t('invitedAsLabel', { inviter: preview.invitedBy, role, label: preview.label })
          : t('invitedAs', { inviter: preview.invitedBy, role })}
      </p>
    </div>
  );

  let body: ReactNode;
  if (preview.status === 'EXPIRED') {
    body = (
      <Notice icon={<ClockIcon width={20} height={20} />} title={t('expired.title')}>
        {t('expired.body', { inviter: preview.invitedBy })}
      </Notice>
    );
  } else if (!session) {
    body = (
      <>
        <JoinSignupForm token={token} email={preview.email} />
        <p className="text-center text-body text-ink-muted">
          {t('haveAccount')}{' '}
          <Link
            href={`/login?next=${encodeURIComponent(`/join/${token}`)}`}
            className="font-medium text-ink-accent hover:underline"
          >
            {t('logInToJoin')}
          </Link>
        </p>
      </>
    );
  } else if (session.user.email !== preview.email) {
    body = (
      <Notice icon={<AlertIcon width={20} height={20} />} title={t('mismatch.title')}>
        <span className="flex flex-col gap-4">
          {t('mismatch.body', { invited: preview.email, current: session.user.email })}
          <span className="self-start">
            <SignOutButton />
          </span>
        </span>
      </Notice>
    );
  } else {
    const member = await resolveMember(session.userId);
    if (member) {
      const empty = await isWeddingEmpty(member.weddingId);
      body = (
        <Notice icon={<CalendarIcon width={20} height={20} />} title={t('alreadyMember.title')}>
          <span className="flex flex-col gap-4">
            {empty ? t('alreadyMember.emptyBody') : t('alreadyMember.body')}
            <ButtonLink href="/app" className="self-start">
              {t('alreadyMember.goToWedding')}
            </ButtonLink>
          </span>
        </Notice>
      );
    } else {
      body = (
        <div className="flex flex-col gap-4">
          <p className="flex flex-col rounded-control bg-canvas-muted px-4 py-3">
            <span className="text-label-sm font-semibold tracking-widest text-ink-muted uppercase">
              {t('signedInAs')}
            </span>
            <span className="truncate text-body font-medium text-ink">{session.user.email}</span>
          </p>
          <JoinButton token={token} />
          <div className="flex items-center justify-center gap-2 text-body text-ink-muted">
            {t('notYou')}
            <SignOutButton variant="ghost" />
          </div>
        </div>
      );
    }
  }

  return (
    <AuthShell aside={<CeremonyArch />}>
      <div className="flex flex-col gap-8">
        {header}
        {body}
      </div>
    </AuthShell>
  );
}

function Notice({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className="flex gap-3 rounded-card border border-line bg-surface p-5 shadow-card"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-subtle text-danger">
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-title font-semibold text-ink">{title}</h2>
        <div className="text-body break-words text-ink-muted">{children}</div>
      </div>
    </div>
  );
}
