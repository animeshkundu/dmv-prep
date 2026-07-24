import { defineConfig, devices } from '@playwright/test';

/**
 * Runs against the built + previewed static output at the real base path,
 * so base-aware links, 404 handling, and islands are exercised as shipped.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4321/dmv-prep/',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run preview -- --port 4321',
    url: 'http://localhost:4321/dmv-prep/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
