import { expect, test, type Page } from '@playwright/test';

/**
 * Sign-up page. The API is stubbed with page.route so each error path is checked without a
 * database; the real endpoint is covered by tests/security/auth.int.test.ts.
 */
async function stubSignup(page: Page, status: number, body: unknown) {
  await page.route('**/api/auth/signup', (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

async function submit(
  page: Page,
  { name = 'Priya Sharma', email = 'priya@example.com', password = 'plum-and-brass-42' } = {},
) {
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
}

test.describe('sign-up page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/signup');
  });

  test('renders the form and links to sign-in', async ({ page }) => {
    await expect(page).toHaveTitle('Create account · Shaadioo');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Start planning your wedding' }),
    ).toBeVisible();
    await expect(page.getByText('At least 10 characters')).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  test('checks fields before calling the server', async ({ page }) => {
    let called = false;
    await page.route('**/api/auth/signup', (route) => {
      called = true;
      return route.abort();
    });
    await submit(page, { name: '   ', email: 'not-an-email', password: 'short' });
    await expect(page.getByText('Enter your name.')).toBeVisible();
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
    await expect(page.getByText('Use at least 10 characters.')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(called).toBe(false);
  });

  test('offers sign-in when the email is already registered', async ({ page }) => {
    await stubSignup(page, 409, {
      error: { code: 'EMAIL_TAKEN', message: 'server text', requestId: 'r1' },
    });
    await submit(page);
    await expect(page.getByText('An account with this email already exists.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in instead' })).toHaveAttribute(
      'href',
      '/login',
    );
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Email')).toBeFocused();
  });

  test('shows the common-password rule under the password field', async ({ page }) => {
    await stubSignup(page, 400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'server text',
        details: { fields: { password: 'server text' } },
        requestId: 'r2',
      },
    });
    await submit(page, { password: 'password123' });
    await expect(page.getByText('This password is too common. Choose another.')).toBeVisible();
    await expect(page.getByText('server text')).toHaveCount(0);
  });

  test('shows the shared banner for other failures', async ({ page }) => {
    await stubSignup(page, 429, {
      error: {
        code: 'RATE_LIMITED',
        message: 'server text',
        details: { retryAfterSeconds: 3600 },
        requestId: 'r3',
      },
    });
    await submit(page);
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'Too many attempts. Please try again in 60 minutes.',
    );
  });

  test('goes to onboarding after creating the account', async ({ page }) => {
    await stubSignup(page, 201, {
      user: { id: 'u1', name: 'Priya Sharma', email: 'priya@example.com' },
    });
    // The stub sets no session cookie, so /onboarding itself bounces on to /login. Wait for the
    // navigation request rather than racing to read the URL before that second redirect.
    const onboarding = page.waitForRequest((req) => new URL(req.url()).pathname === '/onboarding');
    await submit(page);
    await onboarding;
  });
});
