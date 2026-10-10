'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, inputClasses } from '@/components/ui/field';
import { MoreIcon, PencilIcon, PlusIcon, TrashIcon, UsersIcon } from '@/components/ui/icons';
import { deleteJson, patchJson, postJson } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  LABEL_MAX,
  MEMBERS_PER_WEDDING,
  ROLES,
  type Member,
  type MemberInvitation,
  type Role,
  type SentMemberInvitation,
} from '@/modules/members/schemas';
import { InvitationSent } from './invitation-sent';
import { InviteMemberForm } from './invite-member-form';
import { useMemberErrorMessage } from './member-errors';

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')
  ).toUpperCase();
}

type DialogState =
  { kind: 'closed' } | { kind: 'form' } | { kind: 'sent'; sent: SentMemberInvitation };

/**
 * Settings → Members (PRD §9.4, Stitch "Settings: Wedding Members"), Admin only: members with
 * role and label editing and removal, pending invitations with resend and revoke, and the invite
 * dialog. Data comes from the server page; every change refreshes it.
 */
export function MembersPanel({
  members,
  invitations,
  meId,
  meName,
  couple,
}: {
  members: Member[];
  invitations: MemberInvitation[];
  meId: string;
  meName: string;
  couple: readonly [string, string];
}) {
  const t = useTranslations('members.settings.members');
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' });

  function open(next: DialogState) {
    setDialog(next);
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function onSent(sent: SentMemberInvitation) {
    open({ kind: 'sent', sent });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-display text-headline-sm text-ink">{t('title')}</h2>
            <p className="mt-1 max-w-prose text-body text-ink-muted">{t('lead')}</p>
          </div>
          <Button onClick={() => open({ kind: 'form' })} className="shrink-0">
            <PlusIcon width={16} height={16} />
            {t('invite')}
          </Button>
        </div>

        <ul className="flex flex-col divide-y divide-line border-t border-line">
          {members.map((member) => (
            <MemberRow key={member.userId} member={member} isMe={member.userId === meId} />
          ))}
        </ul>

        <p className="text-label text-ink-muted">
          {t('count', {
            count: members.length + invitations.filter((i) => i.status === 'PENDING').length,
            max: MEMBERS_PER_WEDDING,
          })}
        </p>
      </Card>

      <PendingInvitations invitations={invitations} onSent={onSent} />

      <dialog
        ref={dialogRef}
        aria-labelledby="invite-dialog-title"
        onClose={() => setDialog({ kind: 'closed' })}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-card bg-surface p-0 text-ink shadow-float backdrop:bg-ink/40"
      >
        <div className="p-6 sm:p-8">
          {dialog.kind === 'form' && <InviteMemberForm onSent={onSent} onCancel={close} />}
          {dialog.kind === 'sent' && (
            <InvitationSent
              sent={dialog.sent}
              inviterName={meName}
              couple={couple}
              onDone={close}
            />
          )}
        </div>
      </dialog>
    </div>
  );
}

function MemberRow({ member, isMe }: { member: Member; isMe: boolean }) {
  const t = useTranslations('members.settings.members');
  const errorMessage = useMemberErrorMessage();
  const router = useRouter();
  const [editing, setEditing] = useState<'role' | 'label'>();
  const [role, setRole] = useState<Role>(member.role);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const removeRef = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);

  function startEdit(focus: 'role' | 'label') {
    if (menuRef.current) menuRef.current.open = false;
    setRole(member.role);
    setError(undefined);
    setEditing(focus);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = String(new FormData(event.currentTarget).get('label') ?? '').trim();
    const body: { role?: Role; label?: string | null } = {};
    if (role !== member.role) body.role = role;
    if (label !== (member.label ?? '')) body.label = label || null;
    if (!Object.keys(body).length) {
      setEditing(undefined);
      return;
    }
    setPending(true);
    setError(undefined);
    const result = await patchJson<Member>(`/api/members/${member.userId}`, body);
    setPending(false);
    if (!result.ok) {
      setError(errorMessage(result));
      return;
    }
    setEditing(undefined);
    router.refresh();
  }

  async function remove() {
    setPending(true);
    setError(undefined);
    const result = await deleteJson(`/api/members/${member.userId}`);
    setPending(false);
    removeRef.current?.close();
    if (!result.ok) {
      setError(errorMessage(result));
      return;
    }
    // Removing yourself ends your access: the /app layout sends you on.
    router.refresh();
  }

  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-title font-semibold text-on-primary"
        >
          {initials(member.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="truncate text-title font-medium text-ink">{member.name}</span>
            {isMe && (
              <Badge size="sm" tone="neutral">
                {t('you')}
              </Badge>
            )}
          </p>
          <p className="truncate text-body text-ink-muted">{member.email}</p>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            {member.label && (
              <Badge size="sm" tone="neutral">
                {member.label}
              </Badge>
            )}
            <Badge
              size="sm"
              tone={member.role === 'ADMIN' ? 'pending' : 'neutral'}
              dot={member.role === 'ADMIN'}
            >
              {t(`roles.${member.role}`)}
            </Badge>
            <span className="text-label text-ink-muted">
              {t('joined', { date: formatDate(member.joinedAt) })}
            </span>
          </p>
        </div>

        <details ref={menuRef} className="relative">
          <summary
            aria-label={t('menu.label', { name: member.name })}
            className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full text-ink-muted hover:bg-fill focus-visible:outline-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden"
          >
            <MoreIcon width={20} height={20} />
          </summary>
          <div className="absolute right-0 z-10 mt-1 flex w-56 flex-col rounded-control border border-line bg-surface py-1 shadow-float">
            <MenuItem onClick={() => startEdit('role')}>
              <UsersIcon width={16} height={16} />
              {t('menu.changeRole')}
            </MenuItem>
            <MenuItem onClick={() => startEdit('label')}>
              <PencilIcon width={16} height={16} />
              {t('menu.editLabel')}
            </MenuItem>
            <MenuItem
              danger
              onClick={() => {
                if (menuRef.current) menuRef.current.open = false;
                setError(undefined);
                removeRef.current?.showModal();
              }}
            >
              <TrashIcon width={16} height={16} />
              {t('menu.remove')}
            </MenuItem>
          </div>
        </details>
      </div>

      {error && !editing && <Alert>{error}</Alert>}

      {editing && (
        <form
          onSubmit={save}
          className="flex flex-col gap-4 rounded-control bg-canvas-muted p-4 sm:ml-14"
        >
          <fieldset>
            <legend className="mb-2 text-body font-medium text-ink">{t('edit.role')}</legend>
            <div className="inline-flex rounded-control bg-fill p-1">
              {ROLES.map((value) => (
                <label
                  key={value}
                  className={cn(
                    'cursor-pointer rounded-control px-4 py-1.5 text-body font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus',
                    role === value ? 'bg-surface text-ink shadow-card' : 'text-ink-muted',
                  )}
                >
                  <input
                    type="radio"
                    name="role"
                    value={value}
                    checked={role === value}
                    onChange={() => setRole(value)}
                    autoFocus={editing === 'role' && value === member.role}
                    className="sr-only"
                  />
                  {t(`roles.${value}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <Field
            id={`label-${member.userId}`}
            label={t('edit.label')}
            hint={t('edit.labelHint', { max: LABEL_MAX })}
          >
            <input
              id={`label-${member.userId}`}
              name="label"
              type="text"
              defaultValue={member.label ?? ''}
              maxLength={LABEL_MAX}
              autoFocus={editing === 'label'}
              aria-describedby={`label-${member.userId}-hint`}
              className={inputClasses}
            />
          </Field>
          {error && <Alert>{error}</Alert>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setEditing(undefined)}>
              {t('edit.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t('edit.saving') : t('edit.save')}
            </Button>
          </div>
        </form>
      )}

      <dialog
        ref={removeRef}
        aria-labelledby={`remove-${member.userId}`}
        className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-card bg-surface p-0 text-ink shadow-float backdrop:bg-ink/40"
      >
        <div className="flex flex-col gap-4 p-6 sm:p-8">
          <h2 id={`remove-${member.userId}`} className="font-display text-headline-sm break-words">
            {t('remove.title', { name: member.name })}
          </h2>
          <p className="text-body-lg text-ink">{isMe ? t('remove.selfBody') : t('remove.body')}</p>
          <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => removeRef.current?.close()}>
              {t('remove.cancel')}
            </Button>
            <Button variant="danger" onClick={remove} disabled={pending}>
              {pending ? t('remove.removing') : t('remove.confirm')}
            </Button>
          </div>
        </div>
      </dialog>
    </li>
  );
}

function MenuItem({
  danger = false,
  onClick,
  children,
}: {
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 px-4 py-2.5 text-left text-body hover:bg-fill focus-visible:bg-fill focus-visible:outline-none',
        danger ? 'text-danger' : 'text-ink',
      )}
    >
      {children}
    </button>
  );
}

function PendingInvitations({
  invitations,
  onSent,
}: {
  invitations: MemberInvitation[];
  onSent: (sent: SentMemberInvitation) => void;
}) {
  const t = useTranslations('members.settings.members');

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="flex items-center gap-2 font-display text-headline-sm text-ink">
        {t('pending.title')}
        <Badge size="sm" tone="neutral">
          {invitations.length}
        </Badge>
      </h2>
      {invitations.length === 0 ? (
        <p className="rounded-control bg-canvas-muted px-4 py-5 text-center text-body text-ink-muted">
          {t('pending.empty')}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line border-t border-line">
          {invitations.map((invitation) => (
            <PendingRow key={invitation.id} invitation={invitation} onSent={onSent} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function PendingRow({
  invitation,
  onSent,
}: {
  invitation: MemberInvitation;
  onSent: (sent: SentMemberInvitation) => void;
}) {
  const t = useTranslations('members.settings.members');
  const errorMessage = useMemberErrorMessage();
  const router = useRouter();
  const [pending, setPending] = useState<'resend' | 'revoke'>();
  const [error, setError] = useState<string>();
  const revokeRef = useRef<HTMLDialogElement>(null);
  const expired = invitation.status === 'EXPIRED';

  async function resend() {
    setPending('resend');
    setError(undefined);
    const result = await postJson<SentMemberInvitation>(
      `/api/member-invitations/${invitation.id}/resend`,
      {},
    );
    setPending(undefined);
    if (result.ok) onSent(result.data);
    else setError(errorMessage(result));
  }

  async function revoke() {
    setPending('revoke');
    setError(undefined);
    const result = await postJson<MemberInvitation>(
      `/api/member-invitations/${invitation.id}/revoke`,
      {},
    );
    setPending(undefined);
    revokeRef.current?.close();
    if (result.ok) router.refresh();
    else setError(errorMessage(result));
  }

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <span className="truncate text-title font-medium text-ink">{invitation.email}</span>
          {invitation.label && (
            <Badge size="sm" tone="neutral">
              {invitation.label}
            </Badge>
          )}
          <Badge
            size="sm"
            tone={invitation.role === 'ADMIN' ? 'pending' : 'neutral'}
            dot={invitation.role === 'ADMIN'}
          >
            {t(`roles.${invitation.role}`)}
          </Badge>
        </p>
        <p className={cn('mt-1 text-label', expired ? 'text-danger' : 'text-ink-muted')}>
          {t('pending.invitedBy', { name: invitation.invitedBy.name })} ·{' '}
          {expired
            ? t('pending.expired', { date: formatDate(invitation.expiresAt) })
            : t('pending.expires', { date: formatDate(invitation.expiresAt) })}
        </p>
        {error && <Alert className="mt-3">{error}</Alert>}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" onClick={resend} disabled={pending !== undefined}>
          {pending === 'resend' ? t('pending.resending') : t('pending.resend')}
        </Button>
        <Button
          variant="ghost"
          className="text-danger"
          onClick={() => revokeRef.current?.showModal()}
          disabled={pending !== undefined}
        >
          {t('pending.revoke')}
        </Button>
      </div>

      <dialog
        ref={revokeRef}
        aria-labelledby={`revoke-${invitation.id}`}
        className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-card bg-surface p-0 text-ink shadow-float backdrop:bg-ink/40"
      >
        <div className="flex flex-col gap-4 p-6 sm:p-8">
          <h2 id={`revoke-${invitation.id}`} className="font-display text-headline-sm break-words">
            {t('pending.revokeTitle', { email: invitation.email })}
          </h2>
          <p className="text-body-lg text-ink">{t('pending.revokeBody')}</p>
          <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => revokeRef.current?.close()}>
              {t('pending.cancel')}
            </Button>
            <Button variant="danger" onClick={revoke} disabled={pending !== undefined}>
              {pending === 'revoke' ? t('pending.revoking') : t('pending.revokeConfirm')}
            </Button>
          </div>
        </div>
      </dialog>
    </li>
  );
}
