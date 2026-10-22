import { defineConfig } from '@playwright/test';

// E2E: Firebase エミュレータ (auth + firestore) と、エミュレータにつないだ開発サーバーに対して、実際のブラウザで操作する。
// 実行: npm run test:e2e   (Java が必要。ブラウザの場所を変えるときは PW_CHROMIUM)
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.PW_CHROMIUM || undefined },
  },
  webServer: {
    command: 'npm run dev:e2e',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
