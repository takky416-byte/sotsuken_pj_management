import { expect, test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { login } from './helpers';
import { today } from './dates';

const db = () => getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-sotsuken' }));

test.describe.serial('チームのようす・ありがとう・約束・演出', () => {
  test('学生: チームのようすの表に、メンバーが並び、ありがとうを送れる', async ({ page }) => {
    await login(page, 'a1@trident.ac.jp');
    // チームのようすは、ホームの下に出る (「チーム」のメニューはない)
    await expect(page.getByRole('link', { name: 'チーム', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'チームのようす' })).toBeVisible();
    const rows = page.locator('table.board tbody tr');
    await expect(rows.filter({ hasText: 'A1' })).toBeVisible();
    await expect(rows.filter({ hasText: 'A2' })).toBeVisible();
    // 自分には送れない
    await expect(page.getByRole('button', { name: /A1.*にありがとう/ })).toHaveCount(0);

    await page.getByRole('button', { name: /A2.*にありがとう/ }).click();
    await page.getByLabel('ありがとうの一言').fill('レビュー助かった');
    await page.getByRole('button', { name: '送る', exact: true }).click();
    await expect(page.getByText('「レビュー助かった」')).toBeVisible();
    await expect(rows.filter({ hasText: 'A2' })).toContainText('受 1');
    await expect(rows.filter({ hasText: 'A1' })).toContainText('送 1');

    // 1日5回まで
    for (const n of ['2', '3', '4', '5']) {
      await page.getByRole('button', { name: /A2.*にありがとう/ }).click();
      await page.getByLabel('ありがとうの一言').fill(`その${n}`);
      await page.getByRole('button', { name: '送る', exact: true }).click();
      await expect(page.getByText(`「その${n}」`)).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /A2.*にありがとう/ })).toBeDisabled();
  });

  test('教員: 関与タブに、注意の目安が出る。他のチームの学生には見えない', async ({ page, browser }) => {
    await login(page, 'teacher@trident.ac.jp');
    await page.goto('/teacher/team/A');
    await page.getByRole('button', { name: '関与', exact: true }).click();
    await expect(page.locator('table.board tbody tr').filter({ hasText: 'A1' })).toBeVisible();
    await expect(page.locator('table.board tbody tr').filter({ hasText: 'A2' })).toContainText('受 5');

    const b = await (await browser.newContext()).newPage();
    await login(b, 'b1@trident.ac.jp');
    await b.goto('/');
    await expect(b.locator('table.board')).toHaveCount(0); // B チームは企画検討中。A の表は見えない
    await expect(b.getByText('近内')).toHaveCount(0);
  });

  test('ミーティング: 約束に担当者を付けられ、前回の未完了を引き継げる', async ({ page }) => {
    const d = db();
    await d.doc('teams/A/meetings/2026-09-01').set({
      date: '2026-09-01', decided: '', note: '', createdBy: 'teacher', updatedAt: 1,
      actions: [{ text: '未完了の約束', done: false, owner: 'A2' }, { text: '済んだ約束', done: true, owner: 'A1' }],
    });
    await login(page, 'teacher@trident.ac.jp');
    await page.goto('/teacher/team/A');
    await page.getByRole('button', { name: 'ミーティング記録', exact: true }).click();
    const card = page.locator('.card').filter({ has: page.getByLabel('決まったこと 2026-09-01') });
    await expect(card.getByText('未完了の約束')).toBeVisible();
    await expect(card.locator('.badge', { hasText: 'A2' })).toBeVisible();
    await card.getByLabel('担当する人 2026-09-01').selectOption('A1');
    await card.getByLabel('やることを追加 2026-09-01').fill('岩田の新しい約束');
    await card.getByLabel('やることを追加 2026-09-01').press('Enter');
    await card.getByRole('button', { name: '保存', exact: true }).click();
    await expect.poll(async () => (await d.doc('teams/A/meetings/2026-09-01').get()).data()?.actions).toContainEqual(
      { text: '岩田の新しい約束', done: false, owner: 'A1' });
    await d.doc('teams/A/meetings/2026-09-01').delete();
  });

  test('作業ログ: 今日自分が更新したタスクが先に選ばれ、提出するとお祝いが出る', async ({ page }) => {
    const d = db();
    await d.doc(`teams/A/dailyReports/${today()}_A1`).delete(); // 今日の作業ログを、まだ出していない状態にする
    await d.doc('teams/A/tasks/mine-today').set({
      title: '先に選ばれるタスク', detail: '', parentId: null, depth: 1, order: 99990, status: 'doing', assignees: [], links: [],
      startDate: null, endDate: null, source: 'user', createdBy: 'A1', updatedBy: 'A1', createdAt: 1, updatedAt: Date.now(),
      deleted: false, deletedAt: null,
    });
    await login(page, 'a1@trident.ac.jp');
    await page.getByRole('link', { name: '作業ログ', exact: true }).click();
    const card = page.locator('.dcard', { hasText: '先に選ばれるタスク' });
    await expect(card.getByRole('button', { name: '進んだ' })).toHaveAttribute('aria-pressed', 'true'); // 今日更新したので、先に入っている
    for (const c of await page.locator('.dcard.on textarea').all()) await c.fill('調べた内容を整理して、共有した');
    await page.getByLabel('次にやること', { exact: true }).fill('続きを進めて、レビューを受ける');
    await page.getByRole('button', { name: '作業ログを入れる' }).click();
    await expect(page.locator('.celebrate-msg')).toContainText('提出しました');
    await d.doc('teams/A/tasks/mine-today').delete();
  });

  test('配色を選べる。選んだ配色は、再読み込みしても残る', async ({ page }) => {
    await login(page, 'a1@trident.ac.jp');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-palette', 'ocean'); // 既定
    await page.getByLabel('配色').selectOption('mint');
    await expect(html).toHaveAttribute('data-palette', 'mint');
    await page.reload();
    await expect(html).toHaveAttribute('data-palette', 'mint');
    await page.getByLabel('配色').selectOption('ocean');
  });

  test('トーンを選べる。既定は標準 (絵文字なし)。カジュアルでは見出しに絵文字が出る。シンプルは装飾なし。選んだトーンは残る', async ({ page }) => {
    await login(page, 'a1@trident.ac.jp');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-tone', 'standard');
    const em = page.locator('.em').first();
    await expect(em).toBeHidden();
    await page.getByLabel('トーン').selectOption('casual');
    await expect(html).toHaveAttribute('data-tone', 'casual');
    await expect(em).toBeVisible();
    // 利用ガイドも、トーンに合わせた言い方になる
    const dialog = page.getByRole('dialog', { name: '利用ガイド' });
    await page.getByRole('button', { name: /ガイド/ }).first().click();
    await expect(dialog).toContainText('まずホームをチェックしましょう');
    await page.getByRole('button', { name: 'ガイドを閉じる' }).click();
    await page.reload();
    await expect(html).toHaveAttribute('data-tone', 'casual');
    await page.getByLabel('トーン').selectOption('simple');
    await expect(html).toHaveAttribute('data-tone', 'simple');
    await page.getByRole('button', { name: /ガイド/ }).first().click();
    await expect(dialog).toContainText('最初にホームを確認します');
    await page.getByRole('button', { name: 'ガイドを閉じる' }).click();
    await expect(em).toBeHidden();
    // 使い方ページも、トーンに合わせた言い方になる
    await page.getByRole('link', { name: '使い方', exact: true }).click();
    await page.getByText('作業ログの書き方').click();
    await expect(page.getByText('前回の作業ログ以降の作業をまとめて記入します')).toBeVisible();
    await page.getByLabel('トーン').selectOption('casual');
    await expect(page.getByText('まとめて書きましょう', { exact: false }).first()).toBeVisible();
    await page.getByLabel('トーン').selectOption('standard');
    await expect(page.getByText('まとめて書きます。', { exact: false }).first()).toBeVisible();
    await page.getByRole('link', { name: 'ホーム' }).click();

    await page.getByLabel('トーン').selectOption('standard');
    await expect(html).toHaveAttribute('data-tone', 'standard');
  });

  test('作業ログのチーム内閲覧がオフでも、チームのようすは崩れない (他の人の作業ログは集計しない)', async ({ page }) => {
    const d = db();
    await d.doc('config/settings').set({ peerDailyView: false }, { merge: true });
    try {
      await login(page, 'a1@trident.ac.jp');
      const rows = page.locator('table.board tbody tr');
      await expect(rows.filter({ hasText: 'A1' })).toBeVisible();
      await expect(rows.filter({ hasText: 'A1' })).not.toContainText('—日'); // 自分の作業ログは出る
      await expect(rows.filter({ hasText: 'A2' }).locator('td').nth(1)).toHaveText('—'); // 他の人は、読めないので集計しない
      await expect(page.getByText('作業ログは、自分の分だけ表示されます')).toBeVisible();
    } finally {
      await d.doc('config/settings').set({ peerDailyView: true }, { merge: true });
    }
  });

  test('教員の「学生の画面」プレビューでも、チームのようすが開く', async ({ page }) => {
    await login(page, 'teacher@trident.ac.jp');
    await page.goto('/teacher/preview/A1');
    await expect(page.getByRole('heading', { name: 'チームのようす' })).toBeVisible();
    await expect(page.locator('table.board tbody tr').filter({ hasText: 'A2' })).toBeVisible();
    await expect(page.getByRole('button', { name: /A2.*にありがとう/ })).toBeDisabled(); // 閲覧のみ
  });
});
