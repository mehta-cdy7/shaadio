import { expect, test, type Page } from '@playwright/test';

/**
 * Sign-in page. The API is stubbed with page.route so each error path is checked without a
 * database; the real endpoint is covered by tests/security/auth.int.test.ts.
 */
async function stubLogin(page: Page, status: number, body: unknown) {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

async function submit(page: Page, email = 'priya@example.com', password = 'not-the-password') {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('sign-in page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('renders the form and links to sign-up', async ({ page }) => {
    await expect(page).toHaveTitle('Sign in · Shaadioo');
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/signup',
    );
  });

  test('checks fields before calling the server', async ({ page }) => {
    let called = false;
    await page.route('**/api/auth/login', (route) => {
      called = true;
      return route.abort();
    });
    await submit(page, 'not-an-email', '');
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
    await expect(page.getByText('Enter your password.')).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Email')).toBeFocused();
    expect(called).toBe(false);
  });

  test('says when a password is too long instead of "required"', async ({ page }) => {
    let called = false;
    await page.route('**/api/auth/login', (route) => {
      called = true;
      return route.abort();
    });
    await submit(page, 'priya@example.com', 'x'.repeat(129));
    await expect(page.getByText('Use at most 128 characters.')).toBeVisible();
    await expect(page.getByText('Enter your password.')).toHaveCount(0);
    expect(called).toBe(false);
  });

  test('shows one message for wrong email or password', async ({ page }) => {
    await stubLogin(page, 401, {
      error: { code: 'INVALID_CREDENTIALS', message: 'server text', requestId: 'r1' },
    });
    await submit(page);
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'Email or password is incorrect.',
    );
    // Email kept; password cleared and focused for the retry.
    await expect(page.getByLabel('Email')).toHaveValue('priya@example.com');
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  });

  test('tells the user how long to wait when rate limited', async ({ page }) => {
    await stubLogin(page, 429, {
      error: {
        code: 'RATE_LIMITED',
        message: 'server text',
        details: { retryAfterSeconds: 290 },
        requestId: 'r2',
      },
    });
    await submit(page);
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'Too many attempts. Please try again in 5 minutes.',
    );
  });

  test('shows a generic message with the reference for unexpected errors', async ({ page }) => {
    await stubLogin(page, 500, {
      error: { code: 'INTERNAL_ERROR', message: 'server text', requestId: 'req-123' },
    });
    await submit(page);
    const alert = page.getByRole('main').getByRole('alert');
    await expect(alert).toContainText('Something went wrong. Please try again.');
    await expect(alert).toContainText('req-123');
    await expect(alert).not.toContainText('server text');
  });

  test('explains when the server cannot be reached', async ({ page }) => {
    await page.route('**/api/auth/login', (route) => route.abort('internetdisconnected'));
    await submit(page);
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      "We couldn't reach Shaadioo. Check your internet connection and try again.",
    );
  });

  test('show/hide reveals the password', async ({ page }) => {
    const password = page.getByLabel('Password', { exact: true });
    await password.fill('secret-value');
    await expect(password).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Show' }).click();
    await expect(password).toHaveAttribute('type', 'text');
  });
});

test('the signed-in placeholder sends visitors without a session to sign-in', async ({ page }) => {
  await page.goto('/onboarding');
  await expect(page).toHaveURL('/login');
});
