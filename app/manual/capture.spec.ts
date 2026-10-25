import { test } from '@playwright/test';
import { loginAs, shot, SHOTS } from './lib';

// 学生編の画面写真。枠と番号は、manual/build.mjs の手順の説明と対応している。
test('学生編の画面写真', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  // 1. ログイン
  await page.goto('/');
  await shot(page, '01-login', [{ loc: page.getByRole('button', { name: 'Googleでログイン' }), n: 1 }]);
  await loginAs(page, 'a1@trident.ac.jp', {
    keepGuide: true,
    onNotice: () => shot(page, '02-notice', [{ loc: page.getByRole('button', { name: '確認して始める' }), n: 1 }]),
  });

  // 2. はじめてのガイド
  const dialog = page.getByRole('dialog', { name: '利用ガイド' });
  await dialog.waitFor();
  await shot(page, '03-guide', [{ loc: dialog.getByRole('button', { name: '次へ →' }), n: 1 }, { loc: dialog.getByRole('tab', { name: 'こんなとき' }), n: 2 }], { fullPage: false });
  await dialog.getByRole('button', { name: '次へ →' }).click();
  await shot(page, '04-guide-home', [], { fullPage: false });
  await page.getByRole('button', { name: 'ガイドを閉じる' }).click();

  // 3. ホーム
  await page.getByRole('link', { name: 'ホーム' }).click();
  await page.waitForTimeout(800);
  await shot(page, '05-home', [
    { loc: page.getByRole('link', { name: '成果物を提出' }), n: 1 },
    { loc: page.locator('.cta').first(), n: 2 },
    { loc: page.locator('section.card', { has: page.getByRole('heading', { name: /今日やること/ }) }), n: 3 },
    { loc: page.locator('.teacher-msg'), n: 4 },
    { loc: page.locator('.plan-card'), n: 5 },
  ]);
  await page.locator('.home-team').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.locator('.home-team').screenshot({ path: `${SHOTS}/06-home-team.png` });

  // 4. 作業ログ
  await page.getByRole('link', { name: '作業ログ', exact: true }).click();
  await page.getByRole('heading', { name: '1. やったこと' }).waitFor();
  const card = page.locator('.dcard', { hasText: 'トップ画面を作る' });
  await shot(page, '07-daily-empty', [{ loc: card, n: 1 }, { loc: page.getByLabel('次にやること', { exact: true }), n: 2 }]);
  await card.getByRole('button', { name: '進んだ' }).click();
  await card.getByLabel(/の説明/).fill('トップ画面の枠組みを作り、イベントのカードを3つ並べた');
  await page.getByLabel('次にやること', { exact: true }).fill('イベントのカードに、日付と場所を表示する');
  await page.waitForTimeout(500);
  await shot(page, '08-daily-filled', [
    { loc: card.locator('.seg'), n: 1 },
    { loc: card.getByLabel(/の説明/), n: 2 },
    { loc: page.getByLabel('次にやること', { exact: true }), n: 3 },
    { loc: page.getByRole('button', { name: /作業ログを(送信|更新する)/ }), n: 4 },
  ]);
  await page.getByRole('button', { name: '作業ログを送信' }).click();
  await page.locator('.celebrate-msg').waitFor();
  await page.waitForTimeout(800);
  await shot(page, '09-daily-done');
  await page.waitForTimeout(3500);

  // 5. WBS・ガントチャート
  await page.getByRole('link', { name: 'WBS・ガントチャート', exact: true }).click();
  await page.locator('.wbs-row').first().waitFor();
  await page.waitForTimeout(1000);
  await shot(page, '10-wbs', [
    { loc: page.getByRole('button', { name: '編集モードにする' }), n: 1 },
    { loc: page.locator('.wbs-ms-row'), n: 2 },
    { loc: page.locator('.wbs-bolt-toggle'), n: 3 },
    { loc: page.getByRole('button', { name: /ガントチャートを大きく/ }), n: 4 },
  ], { maxH: 800 });
  await page.getByRole('button', { name: '編集モードにする' }).click();
  await page.waitForTimeout(600);
  await shot(page, '11-wbs-edit', [
    { loc: page.getByRole('button', { name: '編集モードを終える' }), n: 1 },
    { loc: page.locator('.wbs-row', { has: page.locator('input.title-input[value="検索機能を作る"]') }), n: 2 },
  ], { maxH: 1000 });
  await page.getByRole('button', { name: '編集モードを終える' }).click();
  await page.getByRole('button', { name: /ガントチャートを大きく/ }).click();
  await page.locator('.gantt-row').first().waitFor();
  await page.waitForTimeout(800);
  await shot(page, '12-gantt', [], { maxH: 900 });

  // 6. PJ分析・ミーティング
  await page.getByRole('link', { name: 'PJ分析', exact: true }).click();
  await page.getByRole('link', { name: 'ミーティングを始める' }).waitFor();
  await page.waitForTimeout(1200);
  await shot(page, '13-pj', [{ loc: page.getByRole('link', { name: 'ミーティングを始める' }), n: 1 }]);
  await page.getByRole('link', { name: 'ミーティングを始める' }).click();
  await page.waitForTimeout(1500);
  await shot(page, '14-meeting');

  // 7. 使い方・配色・トーン
  await page.getByRole('link', { name: '使い方', exact: true }).click();
  await page.getByRole('heading', { name: '使い方' }).waitFor();
  await shot(page, '15-help', [{ loc: page.getByRole('button', { name: /ガイド/ }).first(), n: 1 }]);
  await page.getByRole('link', { name: 'ホーム' }).click();
  await shot(page, '16-theme', [{ loc: page.getByLabel('配色', { exact: true }), n: 1 }, { loc: page.getByLabel('トーン', { exact: true }), n: 2 }]);

  // 8. スマホ
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await phone.newPage();
  await loginAs(p, 'a1@trident.ac.jp');
  await p.waitForTimeout(1000);
  await shot(p, '17-phone-home', [], { fullPage: false });
  await p.getByRole('link', { name: '作業ログ', exact: true }).click();
  await p.waitForTimeout(1000);
  await shot(p, '18-phone-daily', [], { fullPage: false });
  await phone.close();
  await ctx.close();
});
