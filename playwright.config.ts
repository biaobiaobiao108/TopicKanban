import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
  ],
  webServer: [
    {
      command: 'bun run dev:web',
      url: 'http://localhost:3000',
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
