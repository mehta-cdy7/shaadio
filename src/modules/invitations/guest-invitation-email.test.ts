import { describe, expect, it } from 'vitest';
import { guestInvitationEmail } from './guest-invitation-email';

const base = {
  to: 'sharma@example.com',
  guestName: 'Sharma <Family>',
  wedding: {
    brideName: 'Princi',
    groomName: 'Akshay',
    nameOrder: 'GROOM_FIRST' as const,
    weddingDate: '2027-02-14',
    city: 'Dehradun',
  },
  events: [
    { name: 'Haldi', date: '2027-02-12' },
    { name: 'Wedding', date: '2027-02-14' },
  ],
  inviteUrl: 'https://shaadio.example/invite/abc',
};

describe('guestInvitationEmail', () => {
  it('names the guest, the couple in their order, the date, city and every event', () => {
    const email = guestInvitationEmail(base);
    expect(email.to).toBe('sharma@example.com');
    expect(email.subject).toBe("Akshay & Princi's wedding invitation");
    expect(email.text).toContain('Dear Sharma <Family>,');
    expect(email.text).toContain('Sunday, 14 February 2027 · Dehradun');
    expect(email.text).toContain('- Haldi: 12 February 2027');
    expect(email.text).toContain('https://shaadio.example/invite/abc');
    expect(email.text).not.toContain('Please reply by');
  });

  it('adds the reply-by date only when there is a deadline', () => {
    const email = guestInvitationEmail({
      ...base,
      wedding: { ...base.wedding, rsvpDeadline: '2027-02-01' },
    });
    expect(email.text).toContain('Please reply by 1 February 2027.');
    expect(email.html).toContain('Please reply by 1 February 2027.');
  });

  it('escapes names and uses no SVG, scripts or tracking images', () => {
    const { html } = guestInvitationEmail(base);
    expect(html).toContain('Dear Sharma &lt;Family&gt;,');
    expect(html).not.toContain('<Family>');
    expect(html).not.toMatch(/<svg|<script|<img/i);
    expect(html).toContain('href="https://shaadio.example/invite/abc"');
  });
});
