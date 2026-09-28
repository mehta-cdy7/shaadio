import { expect, test } from '@playwright/test';

test.describe('landing page', () => {
  test('renders the hero and every section', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Shaadioo');
    await expect(
      page.getByRole('heading', { level: 1, name: 'From roka to reception, all in one place.' }),
    ).toBeVisible();
    for (const id of ['features', 'how-it-works', 'privacy', 'faq']) {
      await expect(page.locator(`#${id}`)).toBeAttached();
    }
  });

  test('start planning links to sign-up', async ({ page }) => {
    await page.goto('/');
    const cta = page.getByRole('link', { name: /Start planning — it's free/ }).first();
    await expect(cta).toHaveAttribute('href', '/signup');
  });

  test('sign-in and sign-up links open a coming-soon page, not a 404', async ({ page }) => {
    for (const [name, heading] of [
      [/Start planning — it's free/, 'Start planning'],
      ['Sign in', 'Sign in'],
    ] as const) {
      await page.goto('/');
      await page.getByRole('link', { name }).first().click();
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(page.getByText('Coming soon')).toBeVisible();
      await page.getByRole('link', { name: 'Back to home' }).click();
      await expect(page).toHaveURL('/');
    }
  });

  test('FAQ answers open without JavaScript state', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Is Shaadioo free?').click();
    await expect(page.getByText(/free for couples and families/)).toBeVisible();
  });

  test('page never scrolls sideways', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('theming', () => {
  const primaryButtonBg = (page: import('@playwright/test').Page) =>
    page
      .getByRole('link', { name: /Start planning — it's free/ })
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);

  test('changing the brand primary recolours the app', async ({ page }) => {
    await page.goto('/');
    const before = await primaryButtonBg(page);
    await page.evaluate(() =>
      document.documentElement.style.setProperty('--sh-brand-primary', 'rgb(0, 128, 0)'),
    );
    // Buttons animate colour changes, so wait for the transition to settle.
    await expect.poll(() => primaryButtonBg(page)).toBe('rgb(0, 128, 0)');
    expect(before).not.toBe('rgb(0, 128, 0)');
  });

  test('dark mode follows the operating system', async ({ browser }) => {
    const bodyBg = async (colorScheme: 'light' | 'dark') => {
      const page = await browser.newPage({ colorScheme });
      await page.goto('/');
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      await page.close();
      return bg;
    };
    expect(await bodyBg('dark')).not.toBe(await bodyBg('light'));
  });

  test('focus ring stays visible on the final call-to-action band in dark mode', async ({
    browser,
  }) => {
    const page = await browser.newPage({ colorScheme: 'dark' });
    await page.goto('/');
    const link = page.getByRole('link', { name: 'See how it works' }).last();
    await link.focus();
    const { outlineStyle, outline, band } = await link.evaluate((el) => ({
      outlineStyle: getComputedStyle(el).outlineStyle,
      outline: getComputedStyle(el).outlineColor,
      band: getComputedStyle(el.closest('section')!).backgroundColor,
    }));
    expect(outlineStyle).not.toBe('none');
    expect(outline).not.toBe(band);
    await page.close();
  });

  test('data-color-scheme forces a scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.evaluate(() => document.documentElement.setAttribute('data-color-scheme', 'dark'));
    const forced = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(forced).not.toBe(light);
  });
});
