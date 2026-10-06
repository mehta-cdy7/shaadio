'use client';

import { useTranslations } from 'next-intl';
import { postJson } from '@/lib/api';
import type { GuestResponse, MarkSentInput } from '@/modules/guests/schemas';

/** The couple's names in their chosen order (`coupleNames`), for the share message. */
export type CoupleNames = readonly [string, string];

/** The pre-filled WhatsApp message (PRD §9.14). */
export function useInviteMessage(couple: CoupleNames) {
  const t = useTranslations('members.guests.link');
  return (guestName: string, url: string) =>
    t('message', { guest: guestName, first: couple[0], second: couple[1], url });
}

/** `POST /api/guests/:id/mark-sent` (API_DESIGN §16): first one wins, so a repeat is harmless. */
export function markSent(guestId: string, via: MarkSentInput['via']) {
  return postJson<GuestResponse>(`/api/guests/${guestId}/mark-sent`, { via });
}
