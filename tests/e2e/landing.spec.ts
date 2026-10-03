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

  test('start planning opens the sign-up page', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('link', { name: /Start planning — it's free/ })
      .first()
      .click();
    await expect(page).toHaveURL('/signup');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Start planning your wedding' }),
    ).toBeVisible();
  });

  test('sign-in link opens the sign-in page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Sign in' }).first().click();
    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();
  });

  test('FAQ answers open without JavaScript state', async ({ page }) => {
    await page.goto('/');
    // The first answer starts open, as in the Stitch design.
    await expect(page.getByText(/free for couples and families/)).toBeVisible();
    await page.getByText('Do guests need to download anything?').click();
    await expect(page.getByText(/No app download at all/)).toBeVisible();
  });

  test('each product mock-up reads as one described image', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('main').getByRole('img')).toHaveCount(6);
    await expect(
      page.getByRole('img', { name: /sample invitation for Priyanka & Nik's wedding/ }),
    ).toBeVisible();
  });

  test('page never scrolls sideways', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

/** WCAG contrast ratio of two computed `rgb(…)` colours. */
function contrastRatio(a: string, b: string): number {
  const luminance = (css: string) => {
    const channels = css
      .match(/[\d.]+/g)
      ?.slice(0, 3)
      .map(Number);
    if (!channels || channels.length < 3) throw new Error(`Unexpected colour: ${css}`);
    const [r, g, bl] = channels.map((c) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

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

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`focus ring stays visible on the final call-to-action band (${colorScheme})`, async ({
      browser,
    }) => {
      const page = await browser.newPage({ colorScheme });
      await page.goto('/');
      const link = page.locator('#get-started').getByRole('link', { name: /Start planning/ });
      await link.focus();
      const ring = () =>
        link.evaluate((el) => ({
          style: getComputedStyle(el).outlineStyle,
          colour: getComputedStyle(el).outlineColor,
          band: getComputedStyle(el.closest('section')!).backgroundColor,
        }));
      expect((await ring()).style).not.toBe('none');
      // WCAG 1.4.11: a focus indicator needs 3:1 against what surrounds it. Buttons animate colour
      // changes, so wait for the ring's transition to settle.
      await expect
        .poll(async () => {
          const { colour, band } = await ring();
          return contrastRatio(colour, band);
        })
        .toBeGreaterThanOrEqual(3);
      await page.close();
    });
  }

  test('data-color-scheme forces a scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.evaluate(() => document.documentElement.setAttribute('data-color-scheme', 'dark'));
    const forced = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(forced).not.toBe(light);
  });
});
