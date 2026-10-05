'use client';

import { useEffect } from 'react';
import { postJson } from '@/lib/api';

/**
 * Tells the server a real browser opened the invitation (API_DESIGN §24). Link-preview bots
 * (WhatsApp, iMessage) fetch the HTML but never run this, so they never mark the link opened.
 * Fire and forget: a failure only means the family sees "not opened" a little longer.
 */
export function OpenedBeacon({ token }: { token: string }) {
  useEffect(() => {
    void postJson(`/api/public/invite/${token}/opened`, {});
  }, [token]);
  return null;
}
