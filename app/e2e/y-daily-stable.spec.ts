import { expect, test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { login } from './helpers';

// 作業ログと WBS の画面を行き来しても、作業ログのタスクが増えない
test('作業ログ: WBSと行き来しても、自分が更新したタスクが、あとから増えない。結果を選んだタスクは、戻っても残る', async ({ page }) => {
  const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-sotsuken' }));
  await login(page, 'a1@trident.ac.jp');
  await page.getByRole('link', { name: '作業ログ', exact: true }).click();
  const cards = () => page.getByRole('button', { name: /は今日は作業していない$/ });
  await expect(page.getByRole('heading', { name: '作業ログ', exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  const n0 = await cards().count();
  // WBS で、自分が別のタスクを更新した (担当ではないが、更新者が自分)
  await db.doc('teams/A/tasks/stable-1').set({
    title: '行き来の確認用タスク', detail: '', parentId: null, depth: 1, order: 97000, status: 'doing', assignees: [], links: [], source: 'user',
    createdBy: 'teacher', updatedBy: 'A1', createdAt: 1, updatedAt: Date.now(), deleted: false, deletedAt: null, startDate: null, endDate: null,
  });
  for (let i = 0; i < 3; i++) {
    await page.getByRole('link', { name: 'WBS・ガントチャート', exact: true }).click();
    await page.locator('.wbs-row').first().waitFor();
    await page.getByRole('link', { name: '作業ログ', exact: true }).click();
    await page.waitForTimeout(400);
    expect(await cards().count()).toBe(n0);
  }
  await expect(page.getByText('行き来の確認用タスク')).toHaveCount(0);
});

test('作業ログ: ×でタスクを外すとき、確認のダイアログは出ない。「元に戻す」で、書いた説明ごと戻る', async ({ page }) => {
  let dialog = false;
  page.on('dialog', (d) => { dialog = true; void d.dismiss(); });
  await login(page, 'a1@trident.ac.jp');
  await page.getByRole('link', { name: '作業ログ', exact: true }).click();
  const skip = page.getByRole('button', { name: /は今日は作業していない$/ }).first();
  const label = (await skip.getAttribute('aria-label')) ?? '';
  const name = label.replace(/は今日は作業していない$/, '');
  const card = page.locator('.dcard', { hasText: name });
  await card.getByRole('button', { name: '進んだ' }).click();
  await card.getByLabel(`${name}の説明`).fill('外す前に書いておいた説明の文章です');
  await skip.click();
  await expect(page.locator('.dcard', { hasText: name })).toHaveCount(0);
  expect(dialog).toBe(false);
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(page.getByLabel(`${name}の説明`)).toHaveValue('外す前に書いておいた説明の文章です');
});
