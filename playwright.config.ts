import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3100',
    browserName: 'chromium',
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: [
    { command: 'node tests/browser-backend.mjs', url: 'http://127.0.0.1:54329/health', timeout: 30_000 },
    {
      command: 'node tests/browser-app.mjs',
      url: 'http://localhost:3100/login', timeout: 120_000,
      env: { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54329', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-test-anon', SUPABASE_SERVICE_ROLE_KEY: 'local-test-service', CRON_SECRET: 'local-test-only' },
    },
  ],
});
