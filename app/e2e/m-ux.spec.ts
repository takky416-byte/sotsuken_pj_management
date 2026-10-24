import { expect, test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { login, row } from './helpers';
import { addDays, today } from './dates';

const db = () => getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-sotsuken' }));
const task = (title: string, o: Record<string, unknown> = {}) => ({
  title, detail: '', parentId: null, depth: 1, order: 99000, status: 'todo', assignees: [], startDate: null, endDate: null, links: [],
  source: 'user', createdBy: 'teacher', updatedBy: 'teacher', createdAt: 1, updatedAt: 1, deleted: false, deletedAt: null, ...o,
});

test.describe.serial('ホーム (今日・次にやること) と WBS の操作', () => {
  test('ホーム: 今日やること・次にやること・日報の状況が出て、1タップで着手・完了・担当できる', async ({ page }) => {
    const d = db();
    await d.doc('teams/A/tasks/ux-overdue').set(task('期限を過ぎたUXタスク', { assignees: ['A1'], endDate: addDays(today(), -3), order: 99001 }));
    await d.doc('teams/A/tasks/ux-doing').set(task('進行中のUXタスク', { assignees: ['A1'], status: 'doing', order: 99002 }));
    await d.doc('teams/A/tasks/ux-soon').set(task('もうすぐ始まるUXタスク', { assignees: ['A1'], startDate: addDays(today(), 5), endDate: addDays(today(), 9), order: 99003 }));
    await d.doc('teams/A/tasks/ux-free').set(task('担当がいないUXタスク', { endDate: addDays(today(), -1), order: 99004 }));
    await d.doc(`teams/A/dailyReports/${today()}_A1`).delete().catch(() => undefined);

    await login(page, 'a1@trident.ac.jp');
    await expect(page.getByRole('heading', { name: /こんにちは/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /今日やること/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /次にやること/ })).toBeVisible();
    const item = (title: string) => page.locator('.todo-item', { hasText: title });
    await expect(item('期限を過ぎたUXタスク')).toContainText('期限を過ぎています');
    await expect(item('進行中のUXタスク')).toContainText('進行中');
    await expect(page.getByText('もうすぐ始まるUXタスク')).toBeVisible(); // 次にやること

    // 着手 → 進行中。完了にする → 完了 (お祝い)
    await item('期限を過ぎたUXタスク').getByRole('button', { name: '着手する' }).click();
    await expect.poll(async () => (await d.doc('teams/A/tasks/ux-overdue').get()).data()?.status).toBe('doing');
    await item('進行中のUXタスク').getByRole('button', { name: '完了にする' }).click();
    await expect(page.locator('.celebrate-msg')).toContainText('完了');
    await expect.poll(async () => (await d.doc('teams/A/tasks/ux-doing').get()).data()?.status).toBe('done');
    await expect(item('進行中のUXタスク')).toHaveCount(0);

    // 担当がいないタスクを、担当する
    await item('担当がいないUXタスク').getByRole('button', { name: '担当する' }).click();
    await expect.poll(async () => (await d.doc('teams/A/tasks/ux-free').get()).data()?.assignees).toEqual(['A1']);

    // 日報: まだ。書くボタン
    await expect(page.locator('.hero .cta')).toBeVisible(); // 日報の状況 (運用開始前・授業日でない日・未提出で、文言が変わる)
    await expect(page.getByRole('link', { name: '日報を書く' })).toBeVisible();
  });

  test('WBS: 「@名前 〜期限」で追加でき、担当・期間を行の中で1タップで変えられる', async ({ page }) => {
    const d = db();
    const me = ((await d.doc('teams/A').get()).data()!.members as { sid: string; name: string }[]).find((m) => m.sid === 'A1')!;
    await login(page, 'a1@trident.ac.jp');
    await page.getByRole('link', { name: 'WBS・ガントチャート', exact: true }).click();

    const add = page.getByPlaceholder(/^タスクを追加/);
    await add.fill(`クイック入力のタスク @${me.name} 〜12/31`);
    await add.press('Enter');
    const r = row(page, 'クイック入力のタスク');
    await expect(r).toBeVisible();
    await expect(r.getByRole('button', { name: /担当を変える/ })).toContainText(me.name);
    await expect(r.getByRole('button', { name: /期間を変える/ })).toContainText('12/31');

    // 担当を外す・付ける (1タップ)
    await r.getByRole('button', { name: /担当を変える/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(me.name) }).click();
    await expect(r.getByRole('button', { name: /担当を変える/ })).toContainText('＋ 担当');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // 期間: かんたん設定「1週間」
    await r.getByRole('button', { name: /期間を変える/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: '1週間' }).click();
    await expect(r.getByRole('button', { name: /期間を変える/ })).toContainText('〜');
    await expect.poll(async () => {
      const s = (await d.collection('teams/A/tasks').where('title', '==', 'クイック入力のタスク').get()).docs[0]?.data();
      return !!s && !!s.startDate && s.endDate === addDays(s.startDate, 6); // 保存の途中は、日付がまだ入っていない
    }).toBe(true);
  });
});
