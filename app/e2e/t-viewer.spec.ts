import { expect, test } from '@playwright/test';
import { login } from './helpers';

// 閲覧専用の教員: 全チームの状況を見られるが、変更の操作は出ない。変更は、セキュリティルールでも禁止している。
test.describe.serial('閲覧専用の教員', () => {
  test('教員が、設定の名簿から、閲覧専用の教員を登録・削除できる', async ({ page }) => {
    await login(page, 'teacher@trident.ac.jp');
    await page.goto('/teacher/settings?tab=roster');
    await expect(page.getByRole('heading', { name: /閲覧専用の教員/ })).toBeVisible();
    await expect(page.getByText('viewer@trident.ac.jp')).toBeVisible();
    await page.getByLabel('閲覧専用の教員の名前').fill('見学');
    await page.getByLabel('閲覧専用の教員のメールアドレス').fill('viewer2@gmail.com');
    await expect(page.getByText('学校のメールアドレス(@trident.ac.jp)を入れてください')).toBeVisible();
    await page.getByLabel('閲覧専用の教員のメールアドレス').fill('viewer2@trident.ac.jp');
    await page.getByRole('button', { name: '登録する', exact: true }).click();
    await expect(page.getByText('見学さんを、閲覧専用で登録しました。')).toBeVisible();
    page.once('dialog', (d) => d.accept());
    await page.locator('li', { hasText: 'viewer2@trident.ac.jp' }).getByRole('button', { name: '外す' }).click();
    await expect(page.getByText('見学さんを外しました。')).toBeVisible();
  });

  test('閲覧専用の教員は、チーム一覧・チーム詳細・ミーティング・PJ分析を見られるが、編集の操作は出ない', async ({ page }) => {
    await login(page, 'viewer@trident.ac.jp');
    await expect(page.getByText('閲覧専用のアカウントです')).toBeVisible();
    // メニューには、変更の画面がない
    const nav = page.getByRole('navigation').first();
    await expect(nav.getByRole('link', { name: 'チーム', exact: true })).toBeVisible();
    for (const n of ['設定', '欠席', '学生の画面', '利用状況']) await expect(nav.getByRole('link', { name: n })).toHaveCount(0);
    // チーム一覧: 全チームが見える。一括の連絡・最新にするは出ない
    await expect(page.getByRole('heading', { name: 'チーム一覧' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'A', exact: true })).toBeVisible();
    await expect(page.getByText('全チームに連絡事項を送る')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '最新にする' })).toHaveCount(0);
    // チーム詳細: 読める。キックオフ・お知らせ・教員メモは出ない
    await page.goto('/teacher/team/A');
    await expect(page.getByRole('heading', { name: 'Aチーム' })).toBeVisible();
    await expect(page.getByRole('link', { name: /キックオフ/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'チームへのお知らせ' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /教員メモ/ })).toHaveCount(0);
    await expect(page.locator('.wbs-add')).toHaveCount(0); // タスクの追加欄はない
    await page.getByRole('button', { name: '作業ログ', exact: true }).click();
    await expect(page.getByText(/提出状況/)).toBeVisible();
    await page.getByRole('button', { name: 'ミーティング記録' }).click();
    await expect(page.getByRole('button', { name: 'この日の記録を追加' })).toHaveCount(0);
    // ミーティング画面・利用状況・PJ分析は開ける
    await page.goto('/meeting/A');
    await expect(page.getByRole('heading', { name: '進捗確認会議の進め方' })).toBeVisible();
    await page.goto('/teacher/report/A');
    await expect(page.getByText('報告書に載せる文章')).toBeVisible();
    await expect(page.getByRole('button', { name: '今すぐ保存' })).toHaveCount(0);
  });

  test('閲覧専用の教員のアクセスが記録され、教員の「利用状況 → アクセス」に出る', async ({ page }) => {
    await login(page, 'teacher@trident.ac.jp');
    await page.goto('/teacher/usage?tab=access');
    await expect(page.getByRole('heading', { name: 'アクセス履歴' })).toBeVisible();
    const row = page.locator('table.access tbody tr', { hasText: '閲覧(閲覧専用)' }).first();
    await expect(row).toContainText('今日');
    await row.getByRole('button').click();
    await expect(page.locator('tr.access-detail')).toContainText('チーム');
  });

  test('閲覧専用の教員が、設定などの変更の画面を直接開いても、チーム一覧に戻される', async ({ page }) => {
    await login(page, 'viewer@trident.ac.jp');
    for (const path of ['/teacher/settings', '/teacher/attendance', '/teacher/kickoff/A', '/teacher/preview', '/teacher/usage', '/teacher/logs', '/teacher/access']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'チーム一覧' })).toBeVisible();
    }
  });
});
