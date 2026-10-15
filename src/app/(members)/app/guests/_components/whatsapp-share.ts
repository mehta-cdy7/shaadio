'use client';

import { useTranslations } from 'next-intl';
import { getJson, postJson, type ApiFailure } from '@/lib/api';
import { whatsAppUrl } from '@/lib/whatsapp';
import type { GuestDetailResponse, GuestResponse, MarkSentInput } from '@/modules/guests/schemas';

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

/**
 * Shares one guest's invitation from a list row. Lists never carry the link (API_DESIGN §29), so it
 * is read from `GET /api/guests/:id`. The tab opens first, inside the click, so a popup blocker
 * allows it. The first share marks the guest sent. Returns the failure, if any.
 */
export function useShareGuest(couple: CoupleNames) {
  const inviteMessage = useInviteMessage(couple);
  return async (
    guest: Pick<GuestResponse, 'id' | 'name' | 'phone' | 'delivery'>,
  ): Promise<ApiFailure | undefined> => {
    const tab = window.open('', '_blank');
    const result = await getJson<GuestDetailResponse>(`/api/guests/${guest.id}`);
    if (!result.ok) {
      tab?.close();
      return result;
    }
    const url = whatsAppUrl(guest.phone, inviteMessage(guest.name, result.data.inviteUrl));
    if (tab) {
      tab.opener = null;
      tab.location.href = url;
    } else {
      window.location.href = url;
    }
    if (!guest.delivery) {
      const marked = await markSent(guest.id, 'WHATSAPP');
      if (!marked.ok) return marked;
    }
    return undefined;
  };
}
