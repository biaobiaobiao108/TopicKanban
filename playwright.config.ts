import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // E2E tests share one local SQLite/auth server; serial execution avoids cross-test races.
  workers: 1,
  fullyParallel: true,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:3030',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
  ],
  webServer: [
    {
      command: 'bun run dev:web',
      url: 'http://localhost:3030',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'bun run dev:server',
      url: 'http://localhost:8787/api/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
