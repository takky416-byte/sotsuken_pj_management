import { expect, test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { login } from './helpers';

test('WBS・ガントチャートを、メンバーごとに絞り込める (教員)', async ({ page }) => {
  const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-sotsuken' }));
  const base = { detail: '', links: [], source: 'user', createdBy: 'teacher', updatedBy: 'teacher', createdAt: 1, updatedAt: 1, deleted: false, deletedAt: null, status: 'doing', order: 95000 };
  await db.doc('teams/A/tasks/who-p').set({ ...base, title: '絞り込み確認の大項目', parentId: null, depth: 1, assignees: [], startDate: null, endDate: null });
  await db.doc('teams/A/tasks/who-1').set({ ...base, title: '岩田だけの仕事', parentId: 'who-p', depth: 2, assignees: ['A1'], startDate: '2026-11-10', endDate: '2026-11-12' });
  await db.doc('teams/A/tasks/who-2').set({ ...base, title: '近内だけの仕事', parentId: 'who-p', depth: 2, assignees: ['A2'], startDate: '2026-11-11', endDate: '2026-11-13' });
  await login(page, 'teacher@trident.ac.jp');
  await page.goto('/teacher/team/A');
  // 一覧のタスク名は、入力欄の中にある
  const list = { filter: ({ hasText }: { hasText: string }) => page.locator('.wbs-row').filter({ has: page.locator(`input[value="${hasText}"]`) }) };
  await expect(list.filter({ hasText: '岩田だけの仕事' })).toHaveCount(1);
  await expect(list.filter({ hasText: '近内だけの仕事' })).toHaveCount(1);
  await page.getByLabel('担当で絞り込む').selectOption('A2');
  await expect(list.filter({ hasText: '近内だけの仕事' })).toHaveCount(1);
  await expect(list.filter({ hasText: '岩田だけの仕事' })).toHaveCount(0);
  await expect(list.filter({ hasText: '絞り込み確認の大項目' })).toHaveCount(1); // 上の階層は残る
  await page.getByLabel('担当で絞り込む').selectOption('');
  await expect(list.filter({ hasText: '岩田だけの仕事' })).toHaveCount(1);

  // ガントチャート
  await page.getByRole('button', { name: /ガントチャートを大きく/ }).click();
  const g = page.locator('.gantt-row');
  await expect(g.filter({ hasText: '岩田だけの仕事' })).toHaveCount(1);
  await page.getByLabel('担当で絞り込む').selectOption('A1');
  await expect(g.filter({ hasText: '岩田だけの仕事' })).toHaveCount(1);
  await expect(g.filter({ hasText: '近内だけの仕事' })).toHaveCount(0);
  await expect(g.filter({ hasText: '絞り込み確認の大項目' })).toHaveCount(1);
  // その人の担当がないときは、案内が出て、絞り込みを戻せる
  await page.getByLabel('担当で絞り込む').selectOption('A2');
  await expect(g.filter({ hasText: '近内だけの仕事' })).toHaveCount(1);
  await page.getByLabel('担当で絞り込む').selectOption('');
  await expect(g.filter({ hasText: '岩田だけの仕事' })).toHaveCount(1);
});
