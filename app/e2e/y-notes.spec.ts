import { expect, test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { login } from './helpers';

const db = () => getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-sotsuken' }));
const notes = (summary: string, issues = '', next = '') => ({ summary, issues, next, by: 'teacher', at: Date.now(), summaryAt: Date.now() });

test.describe.serial('報告書に載せる文章の保存', () => {
  test('画面を開いたまま、ほかの人が保存しても、その内容を古い文章で上書きしない', async ({ page }) => {
    await db().doc('teams/A').update({ reportNotes: notes('最初の概要') });
    await login(page, 'teacher@trident.ac.jp');
    await page.goto('/teacher/report/A');
    await page.getByText('報告書に載せる文章').click();
    const sum = page.getByLabel('1. プロジェクトの概要');
    await expect(sum).toHaveValue('最初の概要');
    // ほかの人 (別の端末) が、書き換えて保存した
    await db().doc('teams/A').update({ reportNotes: notes('ほかの人が直した概要') });
    await expect(sum).toHaveValue('ほかの人が直した概要'); // 触っていない欄は、新しい内容に追いつく
    await page.waitForTimeout(3500); // 自動保存の待ち (1.5秒) より長く
    expect((await db().doc('teams/A').get()).data()?.reportNotes.summary).toBe('ほかの人が直した概要');
  });

  test('自分が書いている欄は、ほかの人の保存が来ても、書きかけのまま残る。そのまま保存できる', async ({ page }) => {
    await db().doc('teams/A').update({ reportNotes: notes('元の概要', '元の課題') });
    await login(page, 'teacher@trident.ac.jp');
    await page.goto('/teacher/report/A');
    await page.getByText('報告書に載せる文章').click();
    const iss = page.getByLabel('6. 課題と今後の予定');
    await iss.fill('自分が書いた課題');
    await db().doc('teams/A').update({ reportNotes: notes('ほかの人の概要', '元の課題') });
    await expect(page.getByLabel('1. プロジェクトの概要')).toHaveValue('ほかの人の概要');
    await expect(iss).toHaveValue('自分が書いた課題');
    await expect.poll(async () => (await db().doc('teams/A').get()).data()?.reportNotes.issues, { timeout: 8000 }).toBe('自分が書いた課題');
    expect((await db().doc('teams/A').get()).data()?.reportNotes.summary).toBe('ほかの人の概要'); // 触っていない欄を、古い内容に戻さない
  });

  test('旧い「課題」と「今後の方針」を合わせて1000字を超えるときは、保存を試さず、字数を知らせる', async ({ page }) => {
    await db().doc('teams/A').update({ reportNotes: notes('概要', 'あ'.repeat(600), 'い'.repeat(600)) });
    await login(page, 'teacher@trident.ac.jp');
    await page.goto('/teacher/report/A');
    await page.getByText('報告書に載せる文章').click();
    await page.getByLabel('1. プロジェクトの概要').fill('概要を少し直した');
    await expect(page.getByText(/1000字まで/)).toBeVisible();
    await expect(page.getByRole('button', { name: '今すぐ保存' })).toBeDisabled();
  });
});
