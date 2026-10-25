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
});
