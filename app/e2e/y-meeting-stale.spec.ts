import { expect, test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { login } from './helpers';

const db = () => getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-sotsuken' }));
const ID = '2026-08-20';

test('教員のミーティング記録: ほかで更新されても、書きかけは消えない。触っていない欄は追いつく', async ({ page }) => {
  await db().doc(`teams/A/meetings/${ID}`).set({ date: ID, createdBy: 'teacher', decided: '最初に決めたこと', actions: [{ text: '調べる', done: false, owner: null }], note: '', updatedAt: 1 });
  await login(page, 'teacher@trident.ac.jp');
  await page.goto('/teacher/team/A');
  await page.getByRole('button', { name: 'ミーティング記録' }).click();
  const box = page.getByLabel(`決まったこと ${ID}`);
  await expect(box).toHaveValue('最初に決めたこと');
  // 触っていないときに、ほかで更新された → 新しい内容に追いつく
  await db().doc(`teams/A/meetings/${ID}`).update({ decided: 'ほかで直したこと', updatedAt: 2 });
  await expect(box).toHaveValue('ほかで直したこと');
  // 書いている途中に、ほかで更新された → 書きかけは残り、知らせが出る
  await box.fill('自分の書きかけ');
  await db().doc(`teams/A/meetings/${ID}`).update({ decided: 'さらに別の人が直した', updatedAt: 3 });
  await expect(page.getByRole('alert')).toContainText('ほかでこの記録が更新されました');
  await expect(box).toHaveValue('自分の書きかけ');
  await page.getByRole('button', { name: '最新の内容に戻す' }).click();
  await expect(box).toHaveValue('さらに別の人が直した');
});
