import { describe, expect, it } from 'vitest';
import { whatsAppUrl } from './whatsapp';

describe('whatsAppUrl', () => {
  it('opens the guest chat from an E.164 phone', () => {
    expect(whatsAppUrl('+919530884388', 'Hi')).toBe('https://wa.me/919530884388?text=Hi');
  });

  it('lets the family pick the chat when there is no phone', () => {
    expect(whatsAppUrl(undefined, 'Hi')).toBe('https://wa.me/?text=Hi');
  });

  it('encodes the message, including the link and non-ASCII names', () => {
    const url = whatsAppUrl('+447700900321', 'Dear Meera & Kabir, see https://x.app/invite/a_b-c?');
    expect(url).toBe(
      'https://wa.me/447700900321?text=Dear%20Meera%20%26%20Kabir%2C%20see%20https%3A%2F%2Fx.app%2Finvite%2Fa_b-c%3F',
    );
    expect(new URL(url).searchParams.get('text')).toBe(
      'Dear Meera & Kabir, see https://x.app/invite/a_b-c?',
    );
  });
});
