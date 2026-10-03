import { beforeEach, describe, expect, it, vi } from 'vitest';

const currentUser = vi.fn();
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`);
});
vi.mock('@/app/_lib/current-user', () => ({ currentUser }));
vi.mock('next/navigation', () => ({ redirect }));

const { redirectIfSignedIn } = await import('./redirect-if-signed-in');

describe('redirectIfSignedIn', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lets visitors without a session see the form', async () => {
    currentUser.mockResolvedValue(undefined);
    await expect(redirectIfSignedIn()).resolves.toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('sends a signed-in user without a wedding to onboarding', async () => {
    currentUser.mockResolvedValue({
      user: { id: 'u1', name: 'Priya', email: 'priya@example.com' },
      refreshed: false,
    });
    await expect(redirectIfSignedIn()).rejects.toThrow('NEXT_REDIRECT /onboarding');
  });
});
