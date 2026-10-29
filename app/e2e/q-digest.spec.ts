import { expect, test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { login } from './helpers';
import { addDays, today } from './dates';

// 教員のダッシュボードは、全チームのタスクではなく、チームごとの「集計メモ」(teams/*/digest/tasks) を読む。
// 学生がタスクを変えると、同じ書き込みでメモも更新され、ダッシュボードの数がその場で変わる。ずれたメモは、教員がチーム詳細を開くと直る。
const db = () => getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-sotsuken' }));
const task = (over: Record<string, unknown>) => ({
  title: 'x', detail: '', parentId: null, depth: 1, order: 1, status: 'todo', assignees: [], startDate: null, endDate: null, links: [], source: 'user',
  createdBy: 'teacher', updatedBy: 'teacher', createdAt: 1, updatedAt: 1, deleted: false, deletedAt: null, ...over,
});

test.describe.serial('ダッシュボードの集計メモ', () => {
  test('メモがないチームは、最初の1回、タスクから作る。数は、全件を読んだときと同じ', async ({ page }) => {
    const d = db();
    await d.recursiveDelete(d.collection('teams/B/tasks'));
    await d.recursiveDelete(d.collection('teams/B/digest'));
    await d.doc('teams/B').update({ status: 'active', kickoffAt: 1, projectName: 'Bの企画', wbsReview: { at: 1, by: 'B1' } }); // 前のテストの状態に左右されないように、そろえる
    await d.recursiveDelete(d.collection('teams/B/taskLogs'));
    const batch = d.batch();
    batch.set(d.doc('teams/B/tasks/d1'), task({ title: '期限を過ぎた担当なし', endDate: addDays(today(), -1) }));
    batch.set(d.doc('teams/B/tasks/d2'), task({ title: '担当ありで期限なし', assignees: ['B1'], order: 2 }));
    await batch.commit();
    // 前のテストで開いたままの画面が、入れ替えの途中のタスクから作ったメモを、最後に消して、最終のタスクから作らせる
    await new Promise((r) => setTimeout(r, 2500));
    await d.recursiveDelete(d.collection('teams/B/digest'));
    await login(page, 'teacher@trident.ac.jp');
    const row = page.getByRole('row', { name: /^B / });
    await expect(row.locator('.progress')).toHaveAttribute('title', '0/2 完了');
    await expect(row).toContainText('期限超過 1件');
    await expect(row).toContainText('担当なしの期限超過 1件');
    await expect.poll(async () => (await d.doc('teams/B/digest/tasks').get()).data()?.total).toBe(2);
  });

  test('学生がタスクを追加すると、同じ書き込みでメモも更新され、ダッシュボードの数がその場で変わる', async ({ browser }) => {
    const t = await (await browser.newContext()).newPage();
    await login(t, 'teacher@trident.ac.jp');
    const row = t.getByRole('row', { name: /^B / });
    await expect(row.locator('.progress')).toHaveAttribute('title', '0/2 完了');

    const s = await (await browser.newContext()).newPage();
    await login(s, 'b1@trident.ac.jp');
    await s.getByRole('link', { name: 'WBS・ガントチャート', exact: true }).click();
    await s.getByRole('button', { name: '編集モードにする' }).click();
    await s.getByPlaceholder(/^タスクを追加/).fill('メモの確認用タスク');
    await s.getByPlaceholder(/^タスクを追加/).press('Enter');
    await expect(s.locator('.wbs-row', { has: s.locator('input.title-input[value="メモの確認用タスク"]') })).toBeVisible();

    await expect(row.locator('.progress')).toHaveAttribute('title', '0/3 完了'); // 再読み込みなし
    const memo = (await db().doc('teams/B/digest/tasks').get()).data();
    expect(memo?.total).toBe(3);
    await s.close(); await t.close();
  });

  test('ずれたメモは、教員がチーム詳細を開くと、タスクから作り直されて直る。「最新にする」でも直る', async ({ page }) => {
    const d = db();
    await d.doc('teams/B/digest/tasks').update({ total: 9, done: 5, due: [] });
    await login(page, 'teacher@trident.ac.jp');
    await page.getByRole('link', { name: 'B', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Bチーム' })).toBeVisible();
    await expect.poll(async () => (await d.doc('teams/B/digest/tasks').get()).data()?.total, { timeout: 15000 }).toBe(3);

    await d.doc('teams/B/digest/tasks').update({ total: 7 });
    await page.getByRole('link', { name: '← チーム一覧' }).click();
    await expect(page.getByRole('row', { name: /^B / }).locator('.progress')).toHaveAttribute('title', /\/7 完了/);
    await page.getByRole('button', { name: '最新にする' }).click();
    await expect(page.getByRole('row', { name: /^B / }).locator('.progress')).toHaveAttribute('title', '0/3 完了');
  });
});
