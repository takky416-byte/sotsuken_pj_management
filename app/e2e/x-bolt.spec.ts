import { expect, test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { login } from './helpers';

// 報告書のガントチャートは、マイルストーンの行がない。稲妻線が、その分ずれないこと
test('報告書のガントチャート: 稲妻線の上端が、一番上の行の上端と同じ高さ', async ({ page }) => {
  const app = getApps()[0] ?? initializeApp({ projectId: 'demo-sotsuken' });
  const db = getFirestore(app);
  const base = { detail: '', parentId: null, depth: 1, assignees: [], links: [], source: 'user', createdBy: 'teacher', updatedBy: 'teacher', createdAt: 1, updatedAt: 1, deleted: false, deletedAt: null };
  await db.doc('teams/A/tasks/bolt-1').set({ ...base, title: '稲妻確認1', status: 'done', startDate: '2026-11-10', endDate: '2026-11-20', order: 90001 });
  for (let i = 0; i < 4; i++) await db.doc(`milestones/bolt-ms-${i}`).set({ title: `重なる予定の長い名前${i}`, date: '2026-11-12', endDate: null, teamId: null, note: '' });
  await login(page, 'teacher@trident.ac.jp');
  await page.goto('/teacher/report/A');
  await page.locator('summary', { hasText: 'ガントチャート' }).click();
  const svg = page.getByRole('img', { name: '稲妻線' });
  await expect(svg).toBeVisible();
  const first = await page.locator('.report-gantt .gantt-row').first().boundingBox();
  const b = await svg.boundingBox();
  expect(Math.abs(b!.y - first!.y)).toBeLessThan(2);
});
