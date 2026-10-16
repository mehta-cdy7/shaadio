import { expect, test } from '@playwright/test';

/**
 * Guest gallery (/gallery/[token]). An unknown or malformed link is the generic not-found page and
 * is never cached or indexed; the gallery itself is covered by tests/security/gallery.int.test.ts.
 */
test('an unknown gallery link is the generic not-found page', async ({ page }) => {
  for (const token of ['AAAAAAAAAAAAAAAAAAAAAA', 'not-a-token']) {
    const res = await page.goto(`/gallery/${token}`);
    expect(res?.status()).toBe(404);
    expect(res?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    expect(res?.headers()['referrer-policy']).toBe('no-referrer');
    await expect(page.getByRole('heading', { name: "This link isn't available." })).toBeVisible();
  }
});
