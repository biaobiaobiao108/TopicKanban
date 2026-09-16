import { defineConfig, devices } from '@playwright/test';

const e2ePort = Number(process.env.PLAYWRIGHT_PORT) || 3031;
const e2eDataDir = `${process.cwd()}/test-results/e2e-data-${process.pid}-${Date.now()}`;
process.env.TOPIC_KANBAN_E2E_DATA_DIR = e2eDataDir;

export default defineConfig({
  testDir: './tests/e2e',
  workers: 2,
  fullyParallel: false,
  reporter: 'line',
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
  ],
  webServer: {
    command: 'bun run dev',
    url: `http://127.0.0.1:${e2ePort}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      PORT: String(e2ePort),
      DATA_DIR: e2eDataDir,
      APP_PASSWORD: 'admin',
      QUICK_DROP_TOKEN: 'e2e-quick-drop-token',
    },
  },
  globalTeardown: './tests/e2e/globalTeardown.ts',
});
