import { expect, test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { login } from './helpers';
import { today, yesterday } from './dates';

const db = () => getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-sotsuken' }));
const A2 = 'a2@trident.ac.jp';

// 何も作業していないときも、正直に出せる。次にやることは、未定でもよい。未定のあと、担当のタスクがなければ、確認を促す。
test.describe.serial('作業なしの提出と、次にやることの未定', () => {
  test('学生: 「今日は何も作業していない」と「まだ決まっていない」で、そのまま提出できる。一覧に「作業なし」と出る', async ({ page }) => {
    await db().doc(`teams/A/dailyReports/${today()}_A2`).delete();
    await login(page, A2);
    await page.getByRole('link', { name: '作業ログ', exact: true }).click();
    const submit = page.getByRole('button', { name: '作業ログを送信' });
    await page.getByRole('button', { name: '今日は何も作業していない' }).click();
    await submit.click();
    await expect(page.getByRole('alert')).toContainText('「次にやること」を書くか、「まだ決まっていない」');
    await page.getByRole('button', { name: '時間がなかった' }).click();
    await page.getByRole('button', { name: 'まだ決まっていない' }).click();
    await expect(page.getByLabel('次にやること')).toHaveCount(0);
    await expect(page.getByText('提出できます(今日は作業なし)')).toBeVisible();
    await submit.click();
    await expect(page.getByText('提出しました。今日のうちは、何度でも直せます。')).toBeVisible();
    const mine = page.locator('.feed .card', { hasText: '作業なし' }).first(); // 名前は、前のテストで変わっていることがあるので、内容で探す
    await expect(mine).toContainText('作業なし');
    await expect(mine).toContainText('時間がなかった');
    await expect(mine).toContainText('まだ決まっていない');
    // 再読み込みしても、そのまま残っている。「やっぱり作業した」で戻せる
    await page.reload();
    await page.getByRole('link', { name: '作業ログ', exact: true }).click();
    await expect(page.getByRole('button', { name: '時間がなかった' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'やっぱり作業した' }).click();
    await expect(page.getByRole('button', { name: '今日は何も作業していない' })).toBeVisible();
  });

  test('教員: ミーティングの提出状況に「無」(作業なしで提出)と出る', async ({ page }) => {
    // 運用開始日は、前のテストで動かされていることがあるので、昨日に戻す
    await db().doc('config/settings').set({ peerDailyView: true, rotateOrder: true, dailyStartDate: yesterday() });
    await db().doc(`teams/A/dailyReports/${yesterday()}_A2`).set({
      sid: 'A2', date: yesterday(), dayKey: Number(yesterday().replaceAll('-', '')), entries: [], blocker: '', next: '', absent: false,
      noWork: true, noWorkReason: 'later', nextUndecided: true, submittedAt: 1, updatedAt: 1,
    });
    await login(page, 'teacher@trident.ac.jp');
    await page.goto('/meeting/A');
    await page.locator('.step').nth(1).click(); // 「事実の確認」の段階
    await expect(page.getByRole('heading', { name: /作業ログの提出状況/ })).toBeVisible();
    await expect(page.locator('.matrix .mk-nowork')).toHaveText('無');
  });

  test('前回が未定で、担当のタスクがなければ、次の授業のはじめに、確認を促す。担当が決まれば出ない', async ({ page }) => {
    const d = db();
    await d.doc(`teams/A/dailyReports/${today()}_A2`).delete();
    // 近内さんの担当を、すべて外す
    const mine = await d.collection('teams/A/tasks').where('assignees', 'array-contains', 'A2').get();
    for (const t of mine.docs) await t.ref.update({ assignees: FieldValue.arrayRemove('A2') });
    await login(page, A2);
    const nudge = page.getByRole('note', { name: 'タスクの確認のお知らせ' });
    await expect(nudge).toContainText('担当のタスクを、決めましょう');
    await expect(nudge).toContainText('「次にやること」が未定でした');
    // 作業ログの画面にも出る
    await page.getByRole('link', { name: '作業ログ', exact: true }).click();
    await expect(page.getByRole('note', { name: 'タスクの確認のお知らせ' })).toBeVisible();
    // 担当のタスクが決まると、出なくなる
    await d.doc('teams/A/tasks/nowork-1').set({
      title: '担当が決まったタスク', detail: '', parentId: null, depth: 1, order: 99990, status: 'doing', assignees: ['A2'],
      startDate: null, endDate: null, links: [], source: 'user', createdBy: 'teacher', updatedBy: 'teacher',
      createdAt: 1, updatedAt: 1, deleted: false, deletedAt: null,
    });
    await page.reload();
    await expect(page.getByRole('note', { name: 'タスクの確認のお知らせ' })).toHaveCount(0);
  });

  test('説明と「次にやること」は、長く(3000字まで)書ける', async ({ page }) => {
    await login(page, 'a1@trident.ac.jp');
    await page.getByRole('link', { name: '作業ログ', exact: true }).click();
    await page.getByRole('button', { name: '＋ 調査・勉強' }).click().catch(() => undefined); // すでに選ばれていれば、押さない
    const note = page.getByLabel('調査・勉強の説明');
    await note.fill('あ'.repeat(2500));
    await expect(note).toHaveValue('あ'.repeat(2500)); // 500字で切られない
    await note.fill('い'.repeat(3100));
    expect((await note.inputValue()).length).toBe(3000); // 3000字で止まる
    const next = page.getByLabel('次にやること');
    await next.fill('う'.repeat(2800));
    await expect(next).toHaveValue('う'.repeat(2800)); // 1000字で切られない
  });
});
