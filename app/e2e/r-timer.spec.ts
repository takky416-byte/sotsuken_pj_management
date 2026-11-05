import { expect, test } from '@playwright/test';
import { login } from './helpers';

// ミーティングのタイマー: 実際の時間と同じ速さで進む。裏に回ったり、処理が遅れても、遅れない。
test('ミーティングのタイマーは、実際の時間どおりに進む。一時停止・再開・リセットもできる', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-05T01:00:00Z') });
  await login(page, 'teacher@trident.ac.jp');
  await page.goto('/meeting/A');
  const timer = page.getByLabel('経過時間');
  await expect(timer).toHaveText('0:00');
  await page.getByRole('button', { name: '▶ 開始' }).click();
  // 1秒ずつではなく、まとめて進めても (処理が遅れた状況)、経過時間は実際の時間と同じ
  await page.clock.fastForward(125_000);
  await expect(timer).toHaveText('2:05');
  await page.clock.runFor(30_000);
  await expect(timer).toHaveText('2:35');
  await page.getByRole('button', { name: '一時停止' }).click();
  await page.clock.fastForward(60_000);
  await expect(timer).toHaveText('2:35'); // 止まっている間は進まない
  await page.getByRole('button', { name: '再開' }).click();
  await page.clock.runFor(10_000);
  await expect(timer).toHaveText('2:45');
  await page.getByRole('button', { name: 'リセット' }).click();
  await expect(timer).toHaveText('0:00');
});
