import { expect, test } from '@playwright/test';

/**
 * Join by member invitation (/join/[token]). Only the database-free path runs here: a malformed
 * token is rejected before any lookup. Joining itself is covered by tests/security/members.int.test.ts.
 */
test('a malformed invitation link shows the invalid state and is not indexed', async ({ page }) => {
  await page.goto('/join/not-a-real-token');
  await expect(page.getByRole('heading', { name: 'Invalid invitation' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to Shaadioo' })).toHaveAttribute('href', '/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('signing in from an invitation returns to it', async ({ page }) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 'u1', name: 'Meera', email: 'meera@example.com' } }),
    }),
  );
  await page.goto('/login?next=%2Fjoin%2Fnot-a-real-token');
  await page.getByLabel('Email').fill('meera@example.com');
  await page.getByLabel('Password', { exact: true }).fill('plum-and-brass-42');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/join\/not-a-real-token$/);
});
