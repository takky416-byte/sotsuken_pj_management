import { defineConfig } from '@playwright/test';

// CSP (Content-Security-Policy) の確認用。画面テスト (e2e) 用にビルドしたもの (CSP つき) を配信して、実際のブラウザで操作し、
// ブロックされた読み込み・スクリプトがないことを確かめる。実行: npm run test:csp
export default defineConfig({
  testDir: 'e2e',
  testMatch: 'csp.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    launchOptions: { executablePath: process.env.PW_CHROMIUM || undefined },
    acceptDownloads: true,
  },
  webServer: {
    command: 'npx vite build --mode e2e --outDir dist-csp --emptyOutDir && npx vite preview --mode e2e --outDir dist-csp --port 5174 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
