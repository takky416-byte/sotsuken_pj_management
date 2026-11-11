import { expect, test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { login } from './helpers';
import { addDays, today, yesterday } from './dates';

const db = () => getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-sotsuken' }));

// 作業ログを書く画面の右側の一覧: 10件ずつのページ送りと、だれの・結果・文字での絞り込み
test('作業ログの画面の一覧: ページ送りと絞り込み', async ({ page }) => {
  const d = db();
  await d.doc('config/settings').set({ peerDailyView: true, rotateOrder: true, dailyStartDate: addDays(today(), -30) });
  await d.doc('teams/A').update({ status: 'active', projectName: '一覧の確認' });
  // A1・A2 が、昨日から12日さかのぼって、1日1件ずつ (24件)。A2 の1件は「詰まった」
  for (let n = 1; n <= 12; n++) {
    const date = addDays(yesterday(), -(n - 1));
    for (const sid of ['A1', 'A2']) {
      await d.doc(`teams/A/dailyReports/${date}_${sid}`).set({
        sid, date, dayKey: Number(date.replaceAll('-', '')), absent: false, blocker: '', next: `フィード用の次${sid}-${n}`,
        entries: [{ kind: 'study', note: `フィード確認${sid}-${n}の作業`, result: sid === 'A2' && n === 5 ? 'stuck' : 'progress' }],
        submittedAt: 1, updatedAt: 1,
      });
    }
  }
  await login(page, 'a1@trident.ac.jp');
  await page.getByRole('link', { name: '作業ログ', exact: true }).click();
  const cards = page.locator('.feed > .card');
  const pager = page.getByRole('navigation', { name: 'ページの切り替え' }).first();

  // 10件ずつ。次へ・前へで切り替わる
  await expect(cards).toHaveCount(10);
  await expect(pager).toContainText('1〜10');
  await page.screenshot({ path: 'e2e-shots/daily-feed-paging.png' });
  const first = await cards.first().innerText();
  await pager.getByRole('button', { name: /次へ/ }).click();
  await expect(cards.first()).not.toHaveText(first);
  await expect(pager).toContainText('ページ 2 /');
  await pager.getByRole('button', { name: /前へ/ }).click();
  await expect(pager).toContainText('1〜10');

  // だれの: 自分だけ → 件数が減り、ほかの人のものは出ない
  await page.getByLabel('だれの作業ログ').selectOption('A2');
  await expect(page.locator('.feed')).toContainText('フィード確認A2-');
  await expect(page.locator('.feed')).not.toContainText('フィード確認A1-');
  await page.getByLabel('だれの作業ログ').selectOption('A1');
  await expect(page.locator('.feed')).not.toContainText('フィード確認A2-');

  // 結果: 詰まった → A2 の1件だけ
  await page.getByRole('button', { name: '絞り込みをやめる' }).click();
  await page.getByLabel('結果で絞り込む').selectOption('stuck');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('フィード確認A2-5の作業');

  // 文字: 説明の一部で絞り込む。合うものがなければ、その旨が出る。ページ送りは、1ページに収まれば出ない
  await page.getByRole('button', { name: '絞り込みをやめる' }).click();
  await page.getByLabel('文字で絞り込む').fill('A1-7');
  await expect(cards).toHaveCount(1);
  await expect(pager).toHaveCount(0);
  await page.getByLabel('文字で絞り込む').fill('存在しない言葉');
  await expect(page.getByText('条件に合う作業ログはありません。')).toBeVisible();
  await page.getByRole('button', { name: '絞り込みをやめる' }).click();
  await expect(cards).toHaveCount(10);
});
