import { expect, test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { today } from './dates';
import { login } from './helpers';

const db = () => getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-sotsuken' }));

test.describe.serial('書きかけが消えない', () => {
  test('教員: チームへの連絡事項の書きかけは、画面を移っても戻る。送ると消える', async ({ page }) => {
    await db().doc('teams/B').update({ message: null });
    await login(page, 'teacher@trident.ac.jp');
    await page.goto('/teacher/team/B');
    const box = page.getByLabel('Bチームへの連絡事項');
    await box.fill('まだ送っていない連絡事項の書きかけです');
    await page.getByRole('link', { name: 'チーム一覧' }).first().click().catch(async () => { await page.goto('/teacher'); });
    await page.goto('/teacher/team/B');
    await expect(page.getByLabel('Bチームへの連絡事項')).toHaveValue('まだ送っていない連絡事項の書きかけです');
    await expect(page.getByText('送っていない書きかけを、戻しました。')).toBeVisible();
    await page.getByRole('button', { name: '連絡事項を送る' }).click();
    await expect(page.getByText('連絡事項を送りました')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Bチームへの連絡事項')).toHaveValue('まだ送っていない連絡事項の書きかけです');
    await expect(page.getByText('送っていない書きかけを、戻しました。')).toHaveCount(0);
  });

  test('学生: 提出したあとに直している作業ログも、画面を移って戻ると残る。ほかの端末で出し直されていたら、上書きの前に確かめる', async ({ page }) => {
    const id = `${today()}_A2`;
    const t0 = Date.now() - 60_000;
    await db().doc(`teams/A/dailyReports/${id}`).set({
      sid: 'A2', date: today(), dayKey: Number(today().replaceAll('-', '')), entries: [], blocker: '', next: '提出したときの次にやることです', absent: false,
      noWork: true, submittedAt: t0, updatedAt: t0,
    });
    await login(page, 'a2@trident.ac.jp');
    await page.getByRole('link', { name: '作業ログ', exact: true }).click();
    const next = page.getByLabel('次にやること', { exact: true });
    await expect(next).toHaveValue('提出したときの次にやることです');
    await next.fill('直している途中の次にやることです');
    await page.getByRole('link', { name: 'WBS・ガントチャート', exact: true }).click();
    await page.getByRole('link', { name: '作業ログ', exact: true }).click();
    await expect(page.getByLabel('次にやること', { exact: true })).toHaveValue('直している途中の次にやることです');
    // ほかの端末から出し直された
    await db().doc(`teams/A/dailyReports/${id}`).update({ next: 'スマホから出し直した内容です', updatedAt: Date.now() });
    let asked = '';
    page.once('dialog', (d) => { asked = d.message(); void d.dismiss(); });
    await page.getByRole('button', { name: /作業ログを(更新する|送信)/ }).click();
    await expect.poll(() => asked).toContain('ほかの端末で、今日の作業ログが更新されています');
    expect((await db().doc(`teams/A/dailyReports/${id}`).get()).data()?.next).toBe('スマホから出し直した内容です'); // やめたので、上書きしない
    await db().doc(`teams/A/dailyReports/${id}`).delete();
  });
});
