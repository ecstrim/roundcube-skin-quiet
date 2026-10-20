import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  // Screenshot set only runs via `make shots` (SHOTS=1), never in the e2e suite.
  testIgnore: process.env.SHOTS ? [] : ['**/shots/**'],
  globalSetup: process.env.SHOTS ? undefined : './tests/e2e/global-setup.ts',
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:8460',
    viewport: { width: 1400, height: 900 },
    screenshot: 'only-on-failure',
  },
});
