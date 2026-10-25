import { defineConfig } from '@playwright/test';

// 操作マニュアルの画面写真と、デモ動画を作る (npm run manual)。テスト用のデータは manual/seed.ts。
export default defineConfig({
  testDir: 'manual',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  globalSetup: './manual/seed.ts',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 1280, height: 800 },
    launchOptions: { executablePath: process.env.PW_CHROMIUM || undefined },
  },
  webServer: { command: 'npm run dev:e2e', url: 'http://127.0.0.1:5173', reuseExistingServer: false, timeout: 60_000 },
});
