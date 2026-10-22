import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('名簿にある教員は、ログインして、チーム一覧に入れる', async ({ page }) => {
  await login(page, 'teacher@trident.ac.jp');
  await expect(page.getByRole('heading', { name: 'チーム一覧' })).toBeVisible();
  await expect(page.getByText('先生(教員)')).toBeVisible();
});

test('名簿にない学校のアカウントは、入れない', async ({ page }) => {
  await login(page, 'other@trident.ac.jp');
  await expect(page.getByRole('heading', { name: 'ログインできません' })).toBeVisible();
  await expect(page.getByText('名簿に登録されていません')).toBeVisible();
});

test('学校以外のアカウントは、入れない', async ({ page }) => {
  await login(page, 'someone@gmail.com');
  await expect(page.getByText('学校のアカウントではありません')).toBeVisible();
});

test('ログアウトすると、ログイン画面に戻る', async ({ page }) => {
  await login(page, 'a1@trident.ac.jp');
  await page.getByRole('button', { name: 'ログアウト' }).click();
  await expect(page.getByRole('button', { name: 'Googleでログイン' })).toBeVisible();
});
