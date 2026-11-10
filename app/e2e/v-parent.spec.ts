import { expect, test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { login } from './helpers';

const db = () => getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-sotsuken' }));
const base = {
  detail: '', depth: 1, parentId: null, status: 'todo', assignees: [], startDate: null, endDate: null, links: [], source: 'user',
  createdBy: 'teacher', updatedBy: 'teacher', createdAt: 1, updatedAt: 1, deleted: false, deletedAt: null,
};

// WBS: タスクの詳細で、親タスクを選び直せる (子も一緒に移る。3階層を超える場所は、候補に出ない)
test('WBS: 詳細の「親タスク」で、タスクを別の親の下に移せる。大項目に戻せる', async ({ page }) => {
  const d = db();
  await d.doc('teams/A/tasks/par-1').set({ ...base, title: '親の移動: 移し先の大項目', order: 99991 });
  await d.doc('teams/A/tasks/par-2').set({ ...base, title: '親の移動: 動かす大項目', order: 99992 });
  await d.doc('teams/A/tasks/par-2c').set({ ...base, title: '親の移動: 動かす大項目の子', parentId: 'par-2', depth: 2, order: 1 });
  await login(page, 'a1@trident.ac.jp');
  await page.getByRole('link', { name: 'WBS・ガントチャート', exact: true }).click();
  await page.getByRole('button', { name: '編集モードにする' }).click();
  const row = page.locator('.wbs-row', { has: page.locator('input[value="親の移動: 動かす大項目の子"]') });
  await row.getByRole('button', { name: '詳細' }).click();
  const sel = page.getByLabel('親の移動: 動かす大項目の子の親タスク');
  // 子 (中項目) は、小項目の下には移せないが、大項目・中項目の候補は出る。自分の親は選ばれている
  await expect(sel).toHaveValue('par-2');
  await sel.selectOption({ label: '親の移動: 移し先の大項目' });
  await expect.poll(async () => (await d.doc('teams/A/tasks/par-2c').get()).data()?.parentId).toBe('par-1');
  expect((await d.doc('teams/A/tasks/par-2c').get()).data()).toMatchObject({ depth: 2 });
  // 大項目にする
  await sel.selectOption({ label: '(なし・大項目にする)' });
  await expect.poll(async () => (await d.doc('teams/A/tasks/par-2c').get()).data()?.parentId).toBeNull();
  expect((await d.doc('teams/A/tasks/par-2c').get()).data()).toMatchObject({ depth: 1 });
  // 自分自身は、親の候補に出ない。ほかの大項目は出る
  const row2 = page.locator('.wbs-row', { has: page.locator('input[value="親の移動: 動かす大項目"]') });
  await row2.getByRole('button', { name: '詳細' }).click();
  const sel2 = page.getByLabel('親の移動: 動かす大項目の親タスク');
  await expect(sel2.locator('option', { hasText: /^親の移動: 動かす大項目$/ })).toHaveCount(0);
  await expect(sel2.locator('option', { hasText: /^親の移動: 移し先の大項目$/ })).toHaveCount(1);
});
