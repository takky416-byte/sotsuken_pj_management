import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { login } from './helpers';

// 主要な画面のスクリーンショットを e2e-shots/ に保存する (見た目の確認用。コミットしない)。
// b-journey のあとに実行され、そのデータを使う。
const OUT = 'e2e-shots';
mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

test.describe.serial('画面の見た目', () => {
  test('教員の画面 (PC)', async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await login(page, 'teacher@trident.ac.jp');
    await page.getByRole('heading', { name: 'チーム一覧' }).waitFor();
    await page.waitForTimeout(800);
    await shot(page, 'teacher-dashboard');
    // ヘッダーは、1行に収まる (配色とトーンの選択欄を並べても折り返さない)
    expect((await page.locator('header').boundingBox())!.height).toBeLessThan(80);
    await page.goto('/meeting/A'); await page.getByLabel('ぜんぶ表示').check(); await page.getByText('今日決めること').first().waitFor(); await page.waitForTimeout(800);
    await shot(page, 'teacher-meeting');
    await page.goto('/teacher/calendar'); await page.getByRole('heading', { name: 'カレンダー' }).waitFor(); await page.waitForTimeout(500);
    await shot(page, 'teacher-calendar');
    await page.goto('/teacher/roster'); await page.getByRole('heading', { name: '名簿の登録' }).waitFor(); await page.waitForTimeout(500);
    await shot(page, 'teacher-roster');
    await page.goto('/teacher/team/A'); await page.getByRole('button', { name: '日報' }).click(); await page.waitForTimeout(800);
    await shot(page, 'teacher-team-daily');
  });

  test('学生の画面 (PC)', async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await login(page, 'a1@trident.ac.jp');
    await page.waitForTimeout(800);
    await shot(page, 'student-home-pc');
    expect((await page.locator('header').boundingBox())!.height).toBeLessThan(80);
    await page.getByRole('link', { name: '日報', exact: true }).click(); await page.waitForTimeout(800);
    await shot(page, 'student-daily-pc');
    await page.getByLabel('トーン').selectOption('simple');
    await page.getByRole('link', { name: 'ホーム' }).click(); await page.waitForTimeout(500);
    await shot(page, 'student-home-pc-simple');
    await page.getByLabel('トーン').selectOption('casual'); await page.waitForTimeout(500);
    await shot(page, 'student-home-pc-casual');
    await page.getByLabel('トーン').selectOption('standard');
    await page.getByRole('link', { name: '使い方', exact: true }).click(); await page.waitForTimeout(500);
    await shot(page, 'student-help-pc');
  });

  test('学生の画面 (スマホ)', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await login(page, 'a1@trident.ac.jp');
    await page.waitForTimeout(800);
    await shot(page, 'student-home-mobile');
    await page.getByRole('link', { name: 'WBS・ガント', exact: true }).click(); await page.waitForTimeout(800);
    await shot(page, 'student-wbs-mobile');
    await page.getByRole('link', { name: '日報', exact: true }).click(); await page.waitForTimeout(800);
    await shot(page, 'student-daily-mobile');
    await page.goto('/meeting/A'); await page.getByLabel('ぜんぶ表示').check(); await page.getByText('今日決めること').first().waitFor(); await page.waitForTimeout(800);
    await shot(page, 'student-meeting-mobile');
  });
});
