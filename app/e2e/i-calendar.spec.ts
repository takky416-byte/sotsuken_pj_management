import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe.serial('授業日・ミーティング記録の編集', () => {
  test('授業日を追加・変更・CSV追加・削除できる', async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await login(page, 'teacher@trident.ac.jp');
    await page.goto('/teacher/calendar');
    await page.getByRole('heading', { name: '授業日とミーティング' }).waitFor();

    await page.getByLabel('授業日の日付').fill('2031-03-04');
    await page.getByLabel('授業日の備考').fill('テスト用');
    await page.getByRole('button', { name: '授業日を追加' }).click();
    await expect(page.getByLabel('備考 2031-03-04')).toHaveValue('テスト用');

    // 火曜でもミーティングを設定できる
    await page.getByLabel('ミーティング 2031-03-04').click();
    await expect(page.getByLabel('ミーティング 2031-03-04')).toBeChecked();

    await page.getByLabel('時限 2031-03-04').selectOption('1-2');
    await expect(page.getByLabel('時限 2031-03-04')).toHaveValue('1-2');
    await expect(page.getByLabel('ミーティング 2031-03-04')).toBeChecked();
    await page.waitForTimeout(1500); // 保存の完了を待ってから読み直す
    await page.reload();
    await expect(page.getByLabel('時限 2031-03-04')).toHaveValue('1-2');

    // CSV
    await page.getByText('CSVでまとめて追加・更新').click();
    await page.getByPlaceholder(/2026-11-05/).fill('2031-03-11,3-4,CSV分\n2031-03-12,9-9');
    await expect(page.getByText('2行目:')).toBeVisible();
    await page.getByPlaceholder(/2026-11-05/).fill('2031-03-11,3-4,CSV分');
    await page.getByRole('button', { name: '1日を追加・更新する' }).click();
    await expect(page.getByLabel('備考 2031-03-11')).toHaveValue('CSV分');

    // 削除 (2段階)
    for (const d of ['2031-03-04', '2031-03-11']) {
      const row = page.getByRole('row').filter({ has: page.getByLabel(`備考 ${d}`) });
      await row.getByRole('button', { name: '削除' }).click();
      await row.getByRole('button', { name: '本当に削除' }).click();
      await expect(page.getByLabel(`備考 ${d}`)).toHaveCount(0);
    }
  });

  test('チーム詳細でミーティング記録を追加・編集・削除できる', async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await login(page, 'teacher@trident.ac.jp');
    await page.goto('/teacher/team/A');
    await page.getByRole('button', { name: 'ミーティング記録' }).click();
    await page.getByLabel('記録の日付').fill('2031-04-03');
    await page.getByRole('button', { name: 'この日の記録を追加' }).click();
    const decided = page.getByLabel('決まったこと 2031-04-03');
    await decided.fill('設計を確定する');
    await page.getByLabel('やることを追加 2031-04-03').fill('図を描く');
    await page.getByLabel('やることを追加 2031-04-03').press('Enter');
    const card = page.locator('.card').filter({ has: decided });
    await card.getByRole('button', { name: '保存', exact: true }).click();
    await expect(card.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
    await page.waitForTimeout(1000);
    await page.reload();
    await page.getByRole('button', { name: 'ミーティング記録' }).click();
    await expect(page.getByLabel('決まったこと 2031-04-03')).toHaveValue('設計を確定する');
    await expect(page.getByText('図を描く')).toBeVisible();

    const card2 = page.locator('.card').filter({ has: page.getByLabel('決まったこと 2031-04-03') });
    await card2.getByRole('button', { name: 'この記録を削除' }).click();
    await card2.getByRole('button', { name: '本当に削除' }).click();
    await expect(page.getByLabel('決まったこと 2031-04-03')).toHaveCount(0);
  });
});
