import { expect, test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { login } from './helpers';

const TEACHER = 'teacher@trident.ac.jp';

const body = (name: string, task: string) => `企画名: ${name}\n# 要件定義\n- ${task}\n  > やること: 決める\n  > できあがり: 一覧がある`;

const db = () => getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-sotsuken' }));

test.describe.serial('キックオフの叩き台 (2案から選ぶ)', () => {
  // 前のテストで、Bチームが使われていることがあるので、キックオフ前の状態にして、終わったら戻す
  let before: Record<string, unknown> = {};
  test.beforeAll(async () => {
    const ref = db().doc('teams/B');
    const d = (await ref.get()).data() ?? {};
    before = { status: d.status ?? 'planning', kickoffAt: d.kickoffAt ?? null };
    await ref.update({ status: 'planning', kickoffAt: null });
  });
  test.afterAll(async () => { await db().doc('teams/B').update(before); });

  test('設定で、2案を登録する。キックオフ画面で、案を選ぶと、企画名と叩き台が入る', async ({ page }) => {
    await login(page, TEACHER);
    await page.goto('/teacher/settings?tab=drafts');
    await page.getByLabel(/または、貼り付ける/).fill(`@@ チームB 案1\n${body('案1の企画(仮)', '案1のタスク')}\n\n@@ チームB 案2\n${body('案2の企画(仮)', '案2のタスク')}\n@@ チームZ 案1\n${body('どこにもないチーム', 'x')}`);
    await expect(page.getByText('チームがありません: Z')).toBeVisible();
    await page.getByLabel(/または、貼り付ける/).fill(`@@ チームB 案1\n${body('案1の企画(仮)', '案1のタスク')}\n\n@@ チームB 案2\n${body('案2の企画(仮)', '案2のタスク')}`);
    const check = page.getByLabel('登録する叩き台の確認');
    await expect(check.getByText('案1の企画(仮)')).toBeVisible();
    await expect(check.getByText('案2の企画(仮)')).toBeVisible();
    await page.getByRole('button', { name: '登録する' }).click();
    await expect(page.getByText('2案を登録しました')).toBeVisible();
    await expect(page.getByRole('row', { name: /^B / })).toContainText('案1の企画(仮)');
    await expect(page.getByRole('row', { name: /^B / })).toContainText('案2の企画(仮)');

    await page.goto('/teacher/kickoff/B');
    await expect(page.getByText('登録済みの叩き台があります(2案)')).toBeVisible();
    await expect(page.getByLabel('採用する企画名')).toHaveValue('案1の企画(仮)');
    await expect(page.getByText('案1のタスク').first()).toBeVisible();
    await page.getByLabel(/叩き台のタスク/).press('Tab'); // 欄が読めることの確認
    // 企画②を選ぶと、企画名と叩き台が入れ替わる
    await page.getByLabel(/企画②/).check();
    await expect(page.getByLabel('採用する企画名')).toHaveValue('案2の企画(仮)');
    await expect(page.getByLabel(/叩き台のタスク/)).toHaveValue(new RegExp('案2のタスク'));
    await expect(page.getByText('取り込む叩き台の中身を見る')).toBeVisible();
    // キックオフはしない (ほかのテストが、Bチームは企画検討中のままであることを前提にしている)
  });

  test('先生が企画名を直したあとは、案を切り替えても上書きしない。登録は消せる', async ({ page }) => {
    await login(page, TEACHER);
    await page.goto('/teacher/kickoff/B');
    await page.getByLabel('採用する企画名').fill('先生が決めた名前');
    await page.getByLabel(/企画①/).check();
    await expect(page.getByLabel('採用する企画名')).toHaveValue('先生が決めた名前');
    await expect(page.getByLabel(/叩き台のタスク/)).toHaveValue(new RegExp('案1のタスク'));

    await page.goto('/teacher/settings?tab=drafts');
    page.on('dialog', (d) => void d.accept());
    const b = page.getByRole('row', { name: /^B / });
    await b.getByRole('button', { name: '消す' }).first().click();
    await b.getByRole('button', { name: '消す' }).first().click();
    await expect(b.getByText('未登録')).toHaveCount(2);
  });
});
