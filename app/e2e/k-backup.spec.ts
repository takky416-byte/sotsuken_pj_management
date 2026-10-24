import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { login } from './helpers';

const db = () => getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-sotsuken' }));

test.describe.serial('ガントチャートの日付入力とバックアップの復元', () => {
  test('ガントチャート: 日付を入力すると棒が出る。開始日だけなら同じ日にそろう', async ({ page }) => {
    await db().doc('teams/A/tasks/gantt-3').set({
      title: '日付入力の確認用', detail: '', parentId: null, depth: 1, order: 99997, status: 'todo', assignees: [],
      startDate: null, endDate: null, links: [], source: 'user', createdBy: 'teacher', updatedBy: 'teacher',
      createdAt: 1, updatedAt: 1, deleted: false, deletedAt: null,
    });
    await login(page, 'a1@trident.ac.jp');
    await page.getByRole('link', { name: 'WBS・ガントチャート', exact: true }).click();
    await page.getByRole('button', { name: /ガントチャートを大きく/ }).click();
    const row = page.locator('.gantt-row', { hasText: '日付入力の確認用' });
    await expect(row.locator('.gantt-bar')).toHaveCount(0);
    await page.getByLabel('日付を入力する').click();
    await page.getByLabel('開始日 日付入力の確認用').fill('2026-12-01');
    await expect(row.locator('.gantt-bar')).toHaveCount(1);
    await expect(page.getByLabel('終了日 日付入力の確認用')).toHaveValue('2026-12-01');
    await page.getByLabel('終了日 日付入力の確認用').fill('2026-12-15');
    await expect(page.getByLabel('終了日 日付入力の確認用')).toHaveValue('2026-12-15');
    await expect.poll(async () => (await db().doc('teams/A/tasks/gantt-3').get()).data()).toMatchObject(
      { startDate: '2026-12-01', endDate: '2026-12-15', updatedBy: 'A1' });
  });

  test('復元: バックアップを書き出し、タスクを壊してから、復元で元に戻る', async ({ page }) => {
    await login(page, 'teacher@trident.ac.jp');
    await page.goto('/teacher/export');
    await page.getByRole('button', { name: 'データを読み込む' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'バックアップ(JSON)をダウンロード' }).click()]);
    const file = await dl.path();

    // 作業ログも、復元で元に戻る (教員が作業ログを書き込めるルールの確認)
    const dailyRef = (await db().collection('teams/A/dailyReports').limit(1).get()).docs[0].ref;
    const originalBlocker = (await dailyRef.get()).data()!.blocker;
    await dailyRef.update({ blocker: 'いたずらで書き換えた' });

    // 壊す: タスクのタイトルを変え、あとから文書を足す
    await db().doc('teams/A/tasks/gantt-3').update({ title: '壊れたタイトル', deleted: true });
    await db().doc('teams/A/tasks/after-backup').set({
      title: 'バックアップのあとに増えた', detail: '', parentId: null, depth: 1, order: 99995, status: 'todo', assignees: [], links: [],
      startDate: null, endDate: null, source: 'user', createdBy: 'teacher', updatedBy: 'teacher', createdAt: 1, updatedAt: 1,
      deleted: true, deletedAt: 1,
    });

    await page.goto('/teacher/export');
    await page.getByLabel('バックアップファイル').setInputFiles(file);
    await page.getByLabel('すべて(名簿・設定・予定・全チーム)').uncheck();
    await page.getByLabel('Aチーム').check();
    await page.getByRole('button', { name: '内容を確認する' }).click();
    await expect(page.getByText('teams/A/tasks')).toBeVisible();
    await expect(page.getByText(/バックアップにないので、そのまま残る: [1-9]/)).toBeVisible();

    const [before] = await Promise.all([page.waitForEvent('download'), (async () => {
      await page.getByRole('button', { name: '復元する', exact: true }).click();
      await page.getByRole('button', { name: /本当に復元する/ }).click();
    })()]);
    expect(before.suggestedFilename()).toContain('before-restore');
    await expect(page.getByText(/件を復元しました/)).toBeVisible();

    expect((await dailyRef.get()).data()!.blocker).toBe(originalBlocker);
    const back = (await db().doc('teams/A/tasks/gantt-3').get()).data();
    expect(back).toMatchObject({ title: '日付入力の確認用', deleted: false, updatedBy: 'A1' }); // 元の更新者のまま
    expect((await db().doc('teams/A/tasks/after-backup').get()).exists).toBe(true); // 消えない
    expect(JSON.parse(readFileSync(file, 'utf8')).meta.app).toBe('sotsuken-pj');
  });

  test('復元: 別のファイルは理由つきで断る', async ({ page }) => {
    await login(page, 'teacher@trident.ac.jp');
    await page.goto('/teacher/export');
    await page.getByLabel('バックアップファイル').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
    await expect(page.getByText('このアプリのバックアップではありません')).toBeVisible();
  });
});
