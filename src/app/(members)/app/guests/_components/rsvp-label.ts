'use client';

import { useTranslations } from 'next-intl';
import type { GuestRsvp } from '@/modules/guests/schemas';

/** "Attending · 3", "Not attending" or "Pending", for the client components. */
export function useRsvpLabel() {
  const t = useTranslations('members.guests.rsvp');
  return (rsvp: Pick<GuestRsvp, 'status' | 'attendingCount'>): string =>
    rsvp.status === 'ATTENDING'
      ? t('attendingCount', { count: rsvp.attendingCount })
      : t(rsvp.status);
}
