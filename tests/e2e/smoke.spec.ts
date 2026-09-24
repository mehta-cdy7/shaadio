import { expect, test } from '@playwright/test';

test('home page renders translated content', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Shaadioo' })).toBeVisible();
  await expect(page).toHaveTitle('Shaadioo');
});

test('health check reports the database up', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: 'ok', db: 'up' });
});

test('unknown routes show the generic not-found page', async ({ page }) => {
  const res = await page.goto('/no-such-page');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: "This link isn't available." })).toBeVisible();
});
