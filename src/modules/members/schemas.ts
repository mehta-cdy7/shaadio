import { z } from 'zod';

/** Request and response shapes for members and member invitations (API_DESIGN §12, §26). Client-safe. */

export const ROLES = ['ADMIN', 'MANAGER'] as const;
export type Role = (typeof ROLES)[number];

export const LABEL_MAX = 60;
/** Members plus pending invitations (PRD §9.4, API_DESIGN §12 `LIMIT_REACHED`). */
export const MEMBERS_PER_WEDDING = 25;
export const INVITATION_DAYS = 7;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Enter a valid email address.' }).max(254));

/** A blank label is no label. */
const label = z
  .string()
  .trim()
  .max(LABEL_MAX, `Use at most ${LABEL_MAX} characters.`)
  .transform((value) => value || undefined);

export const inviteMemberSchema = z.strictObject({
  email,
  role: z.enum(ROLES),
  label: label.optional(),
});
export type InviteMemberInput = z.input<typeof inviteMemberSchema>;

/** PATCH: omitted is unchanged, `null` (or blank) clears the label (API_DESIGN §5). */
export const updateMemberSchema = z
  .strictObject({
    role: z.enum(ROLES).optional(),
    label: z
      .string()
      .trim()
      .max(LABEL_MAX, `Use at most ${LABEL_MAX} characters.`)
      .transform((value) => value || null)
      .nullable()
      .optional(),
  })
  .refine((value) => value.role !== undefined || value.label !== undefined, {
    message: 'Nothing to change.',
  });
export type UpdateMemberInput = z.input<typeof updateMemberSchema>;

export const acceptInvitationSchema = z.strictObject({ token: z.string().min(1).max(100) });

export type Member = {
  userId: string;
  name: string;
  email: string;
  role: Role;
  label?: string;
  joinedAt: string;
};

export type MemberList = { items: Member[] };

export type MemberInvitation = {
  id: string;
  email: string;
  role: Role;
  label?: string;
  /** EXPIRED is computed from expiresAt, never stored (DATABASE_DESIGN §5.6). */
  status: 'PENDING' | 'EXPIRED' | 'ACCEPTED' | 'REVOKED';
  invitedBy: { userId: string; name: string };
  expiresAt: string;
  createdAt: string;
};

export type MemberInvitationList = { items: MemberInvitation[] };

/** Create and resend only: the link is shown once, to share by WhatsApp or copy. */
export type SentMemberInvitation = MemberInvitation & { joinUrl: string; emailSent: boolean };

/** `GET /api/public/member-invitations/:token` (API_DESIGN §26). */
export type MemberInvitationPreview = {
  wedding: { brideName: string; groomName: string; nameOrder: 'BRIDE_FIRST' | 'GROOM_FIRST' };
  invitedBy: string;
  email: string;
  role: Role;
  label?: string;
  status: 'PENDING' | 'EXPIRED';
};
