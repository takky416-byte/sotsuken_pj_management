import { expect, test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { login } from './helpers';

test.describe.serial('ガントチャートと使い方', () => {
  test.beforeAll(async () => {
    const app = getApps()[0] ?? initializeApp({ projectId: 'demo-sotsuken' });
    const db = getFirestore(app);
    const base = {
      detail: '', parentId: null, depth: 1, order: 99999, status: 'doing', assignees: [], links: [], source: 'user',
      createdBy: 'teacher', updatedBy: 'teacher', createdAt: 1, updatedAt: 1, deleted: false, deletedAt: null,
    };
    await db.doc('teams/A/tasks/gantt-1').set({ ...base, title: 'ガントチャート確認用の大項目', startDate: '2026-11-02', endDate: '2026-11-30' });
    await db.doc('teams/A/tasks/gantt-2').set({ ...base, title: 'ガントチャート確認用の日付なし', depth: 1, startDate: null, endDate: null, order: 99998 });
  });

  test('教員: チーム詳細のガントチャートに棒が出て、日付なしは別に一覧される', async ({ page }) => {
    await login(page, 'teacher@trident.ac.jp');
    await page.goto('/teacher/team/A');
    await page.getByRole('button', { name: /ガントチャートを大きく/ }).click();
    await expect(page.locator('.gantt-row', { hasText: 'ガントチャート確認用の大項目' }).locator('.gantt-bar')).toHaveCount(1);
    await expect(page.locator('.gantt-row', { hasText: 'ガントチャート確認用の日付なし' }).locator('.gantt-bar')).toHaveCount(0);
    // 稲妻線は、既定で出る。チェックで消せる
    await expect(page.getByRole('img', { name: '稲妻線' })).toBeVisible();
    await page.getByLabel('稲妻線を表示する').uncheck();
    await expect(page.getByRole('img', { name: '稲妻線' })).toHaveCount(0);
    await page.getByLabel('稲妻線を表示する').check();
    await page.screenshot({ path: 'e2e-shots/teacher-gantt.png', fullPage: true });
    await page.getByText(/日付が未設定のタスク/).click();
    await expect(page.locator('details li', { hasText: 'ガントチャート確認用の日付なし' })).toBeVisible();
  });

  test('学生: ガントチャートと使い方が見える', async ({ page }) => {
    await login(page, 'a1@trident.ac.jp');
    await page.getByRole('link', { name: 'WBS・ガントチャート', exact: true }).click();
    // WBSの一覧の右に、期間の棒が並ぶ (期間のない行には出ない)
    await expect(page.locator('.wbs-row', { has: page.locator('input[value="ガントチャート確認用の大項目"]') }).locator('.w-bar .gantt-bar')).toHaveCount(1);
    await expect(page.locator('.wbs-row', { has: page.locator('input[value="ガントチャート確認用の日付なし"]') }).locator('.w-bar .gantt-bar')).toHaveCount(0);
    await page.screenshot({ path: 'e2e-shots/student-wbs-pc.png', fullPage: true });
    await page.getByRole('button', { name: /ガントチャートを大きく/ }).click();
    await expect(page.locator('.gantt-row', { hasText: 'ガントチャート確認用の大項目' }).locator('.gantt-bar')).toHaveCount(1);
    await page.getByRole('link', { name: '使い方', exact: true }).click();
    await expect(page.getByRole('heading', { name: '使い方' })).toBeVisible();
    await page.getByText('日報の書き方').click();
    await expect(page.getByText('何を・どこまでやったか', { exact: false }).first()).toBeVisible();
  });

  test('教員: 使い方(教員)が見える', async ({ page }) => {
    await login(page, 'teacher@trident.ac.jp');
    await page.getByRole('link', { name: '使い方', exact: true }).click();
    await expect(page.getByRole('heading', { name: '使い方(教員)' })).toBeVisible();
  });
});
