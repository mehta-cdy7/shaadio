import { describe, expect, it } from 'vitest';
import { memberInvitationEmail } from './invitation-email';

describe('memberInvitationEmail', () => {
  const email = memberInvitationEmail({
    to: 'meera@example.com',
    inviterName: 'Priya <b>',
    role: 'MANAGER',
    joinUrl: 'https://shaadioo.example/join/abc',
    wedding: { brideName: 'Princi', groomName: 'Akshay', nameOrder: 'GROOM_FIRST' },
  });

  it('names the inviter, the couple in their order and the role', () => {
    expect(email.to).toBe('meera@example.com');
    expect(email.subject).toBe("Priya <b> invited you to help plan Akshay & Princi's wedding");
    expect(email.text).toContain("You'll join as a Manager.");
    expect(email.text).toContain('https://shaadioo.example/join/abc');
    expect(email.text).toContain('expires in 7 days');
  });

  it('escapes names in the HTML body', () => {
    expect(email.html).toContain('Priya &lt;b&gt;');
    expect(email.html).not.toContain('Priya <b>');
    expect(email.html).toContain('href="https://shaadioo.example/join/abc"');
  });
});
