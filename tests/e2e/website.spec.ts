import { expect, test } from '@playwright/test';

/**
 * Public wedding website (/w/[slug]). A draft, deleted or unknown wedding is the generic not-found
 * page; published content is covered by tests/security/website.int.test.ts.
 */
test('an unknown website address is the generic not-found page', async ({ page }) => {
  const res = await page.goto('/w/no-such-couple-abc123');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: "This link isn't available." })).toBeVisible();
});
