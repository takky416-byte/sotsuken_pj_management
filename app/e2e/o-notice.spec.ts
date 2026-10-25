import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe.serial('チームへのお知らせ', () => {
  test('教員がメッセージと提出先を設定すると、学生のホームに出る。消すと出なくなる', async ({ browser }) => {
    const t = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await login(t, 'teacher@trident.ac.jp');
    await t.goto('/teacher/team/A');
    await t.getByLabel(/^メッセージ/).fill('来週は中間確認をします。');
    await t.getByRole('button', { name: 'メッセージを送る' }).click();
    await expect(t.getByText('メッセージを送りました')).toBeVisible();
    await t.getByLabel(/成果物の提出先/).fill('not a url');
    await expect(t.getByRole('button', { name: '提出先を保存' })).toBeDisabled();
    await t.getByLabel(/成果物の提出先/).fill('https://drive.google.com/drive/folders/abc123');
    await t.getByRole('button', { name: '提出先を保存' }).click();
    await expect(t.getByText('提出先を保存しました')).toBeVisible();

    const s = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await login(s, 'a1@trident.ac.jp');
    await expect(s.getByText('来週は中間確認をします。')).toBeVisible();
    const link = s.getByRole('link', { name: /成果物を提出/ });
    await expect(link).toHaveAttribute('href', 'https://drive.google.com/drive/folders/abc123');

    await s.screenshot({ path: 'e2e-shots/student-home-notice.png' });
    // 他のチームの学生には、出ない
    const o = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await login(o, 'b1@trident.ac.jp');
    await expect(o.getByText('来週は中間確認をします。')).toHaveCount(0);

    await t.getByRole('button', { name: 'メッセージを消す' }).click();
    await expect(t.getByText('メッセージを消しました')).toBeVisible();
    await s.reload();
    await expect(s.getByText('来週は中間確認をします。')).toHaveCount(0);
  });

  test('教員が、全チームにまとめてメッセージを送ると、学生のホームに出る。一覧は要確認の設定で並ぶ', async ({ browser }) => {
    const t = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await login(t, 'teacher@trident.ac.jp');
    await t.goto('/teacher');
    await expect(t.getByLabel('要確認のチームを上に並べる')).toBeChecked();
    await t.getByText('全チームにメッセージを送る').click();
    await t.getByLabel('全チームへのメッセージ').fill('全チームへ: 提出物の確認をします。');
    await t.getByRole('button', { name: /チームに送る/ }).click();
    await expect(t.getByText(/チームに送りました/)).toBeVisible();

    const s = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await login(s, 'a1@trident.ac.jp');
    await expect(s.getByText('全チームへ: 提出物の確認をします。')).toBeVisible();

    await t.getByLabel('全チームへのメッセージ').fill('');
    await t.getByRole('button', { name: /チームに送る/ }).click();
    await expect(t.getByText(/メッセージを消しました/)).toBeVisible();
  });

  test('WBS: 自分の担当だけ・すべて閉じる/開く', async ({ page }) => {
    await login(page, 'a1@trident.ac.jp');
    await page.getByRole('link', { name: 'WBS・ガントチャート', exact: true }).click();
    await page.locator('.wbs-row').first().waitFor();
    const all = await page.locator('.wbs-row').count();
    await page.getByRole('button', { name: 'すべて閉じる' }).click();
    const closed = await page.locator('.wbs-row').count();
    expect(closed).toBeLessThan(all);
    await page.getByRole('button', { name: 'すべて開く' }).click();
    await expect(page.locator('.wbs-row')).toHaveCount(all);
    await page.getByLabel('自分の担当だけ').check();
    expect(await page.locator('.wbs-row').count()).toBeLessThanOrEqual(all);
    await page.getByLabel('自分の担当だけ').uncheck();
    await expect(page.locator('.wbs-row')).toHaveCount(all);
  });

  test('ミーティングの議事録: 先生がテキストをアップして公開すると、学生のホームに出る。置き換え・削除ができる。他のチームには出ない', async ({ browser }) => {
    const t = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await login(t, 'teacher@trident.ac.jp');
    await t.goto('/teacher/team/A');
    await t.getByRole('button', { name: 'ミーティング記録' }).click();

    // テキストファイル (Shift_JIS ではなく UTF-8) を選ぶと、本文と日付が入る
    await t.getByLabel('議事録のファイル').setInputFiles({ name: 'A_2026-11-04.txt', mimeType: 'text/plain', buffer: Buffer.from('\uFEFF決まったこと\r\n・画面を先に作る\r\n\r\n\r\n\r\n次の1週間\r\n・検索は後回し', 'utf8') });
    await expect(t.getByLabel('議事録の本文')).toHaveValue(/画面を先に作る/);
    await expect(t.getByLabel('議事録の日付')).toHaveValue('2026-11-04');
    await t.getByRole('button', { name: '公開', exact: true }).click();
    await expect(t.getByText(/の議事録を公開しました/)).toBeVisible();

    const s = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await login(s, 'a1@trident.ac.jp');
    const card = s.getByRole('region', { name: '前回のミーティングの議事録' });
    await expect(card).toContainText('画面を先に作る');
    await expect(card).toContainText('検索は後回し');

    const o = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await login(o, 'b1@trident.ac.jp');
    await expect(o.getByText('画面を先に作る')).toHaveCount(0);

    // 置き換え
    await t.getByLabel('議事録の日付').fill('2026-11-04');
    await t.getByLabel('議事録の本文').fill('置き換えた議事録');
    t.once('dialog', (d) => d.accept());
    await t.getByRole('button', { name: '置き換えて公開' }).click();
    await s.reload();
    await expect(s.getByRole('region', { name: '前回のミーティングの議事録' })).toContainText('置き換えた議事録');

    // 空は公開できない
    await t.getByLabel('議事録の本文').fill('   ');
    await expect(t.getByRole('button', { name: /公開/ }).first()).toBeDisabled();

    // 削除
    t.once('dialog', (d) => d.accept());
    await t.locator('details > summary').filter({ hasText: '置き換えた議事録' }).click();
    await t.getByRole('button', { name: '公開をやめる(削除)' }).click();
    await s.reload();
    await expect(s.getByRole('region', { name: '前回のミーティングの議事録' })).toHaveCount(0);
  });
});
