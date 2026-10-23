import { expect, type Page } from '@playwright/test';

/**
 * Auth エミュレータの Google ログイン (ポップアップ) で、指定のメールアドレスとしてログインする。
 * 実際のアプリのログイン処理 (signInWithPopup) をそのまま通る。
 * 学生の初回の案内が出たら、確認して進む。
 */
export async function login(page: Page, email: string, opts: { keepGuide?: boolean } = {}) {
  await page.goto('/');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Googleでログイン' }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');

  const existing = popup.getByRole('button', { name: new RegExp(email.replace(/[.@]/g, '\\$&')) });
  if (await existing.count()) {
    await existing.first().click();
  } else {
    await popup.getByRole('button', { name: /Add new account/i }).click();
    // 「自動生成」ボタンは入力したメールアドレスを上書きするので、押さずに手で入力する
    await popup.getByLabel(/email/i).fill(email);
    await popup.getByLabel(/display name/i).fill(email.split('@')[0]);
    await popup.getByRole('button', { name: /Sign in with Google/i }).click();
  }
  await popup.waitForEvent('close').catch(() => undefined);

  const start = page.getByRole('button', { name: '確認して始める' });
  const header = page.getByRole('button', { name: 'ログアウト' });
  await expect(start.or(header).or(page.getByRole('heading', { name: 'ログインできません' })).first()).toBeVisible();
  if (await start.isVisible()) {
    await start.click();
    // 初回の利用ガイドが出たら閉じる (keepGuide のときは、そのまま)
    if (opts.keepGuide) return;
    const close = page.getByRole('button', { name: 'ガイドを閉じる' });
    await close.waitFor({ timeout: 3000 }).then(() => close.click()).catch(() => undefined);
  }
}

/** WBS の行 (タイトルが title の行) */
export const row = (page: Page, title: string) =>
  page.locator('.wbs-row', { has: page.locator(`input.title-input[value="${title}"]`) });
