import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const isCI = Boolean(process.env.CI);

/**
 * E2E smoke tests. Guest pages are mobile-first (PRD §12.3), so every spec runs on a mobile and a
 * desktop profile. Needs MONGODB_URI and APP_ORIGIN in the environment (.env.local locally).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // CI builds first and serves the production build; locally the dev server is enough.
    command: isCI ? `next start --port ${PORT}` : `next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
