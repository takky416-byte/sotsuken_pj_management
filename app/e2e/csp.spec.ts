import { expect, test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { login } from './helpers';

// スクリプト攻撃への備え: ページの Content-Security-Policy を、実際のブラウザで確かめる。
// (1) 方針が付いていること (2) アプリの主な画面・書き出しが、方針にブロックされずに動くこと (3) 文章にスクリプトを書いても、動かないこと
test('CSP: 方針が付いていて、主な画面と書き出しがブロックされずに動く。書いたスクリプトは動かない', async ({ page, browser }) => {
  const violations: string[] = [];
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text()); });
  const watch = (p: typeof page) => p.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text()); });

  await page.goto('/');
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(policy).toContain("script-src 'self' https://apis.google.com");
  expect(policy).toContain("object-src 'none'");
  expect(policy).not.toContain("'unsafe-inline' https://apis"); // スクリプトに unsafe-inline は付けない
  expect(policy?.match(/script-src[^;]*/)?.[0]).not.toContain("'unsafe-inline'");
  expect(policy?.match(/script-src[^;]*/)?.[0]).not.toContain("'unsafe-eval'");

  // 悪意のある文章を、チームへの連絡事項に入れておく (チームを運用中にする)
  const evil = '<img src=x onerror="window.__xss=1"> <script>window.__xss=2</script> [罠](javascript:window.__xss=3) <a href="javascript:window.__xss=4">x</a> **太字** https://example.com/ok';
  await getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-sotsuken' })).doc('teams/A').update({ status: 'active', projectName: 'CSPの確認', message: { text: evil, at: Date.now() } });

  // 学生: ログイン → 主な画面。ホームの連絡事項は、文字として出る
  await login(page, 'a1@trident.ac.jp');
  await expect(page.locator('.teacher-msg')).toContainText('<script>window.__xss=2</script>');
  expect(await page.locator('.teacher-msg script, .teacher-msg img[src="x"], .teacher-msg a[href^="javascript:"]').count()).toBe(0);
  for (const name of ['作業ログ', 'WBS・ガントチャート', 'PJ分析', '使い方', 'ホーム']) {
    await page.getByRole('link', { name, exact: true }).first().click();
    await expect(page.locator('main')).toBeVisible();
  }
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();

  // 教員: 連絡事項のプレビューにも、スクリプトは出ない。書き出し (Excel) も動く
  const t = await (await browser.newContext()).newPage();
  await t.addInitScript(() => { (window as unknown as { __csp: string[] }).__csp = []; document.addEventListener('securitypolicyviolation', (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
  watch(t);
  await login(t, 'teacher@trident.ac.jp');
  await t.goto('/teacher/team/A');
  await t.getByLabel('Aチームへの連絡事項').fill('<script>window.__xss=5</script>\n<img src=x onerror="window.__xss=6">\n[リンク](javascript:window.__xss=7)\nhttps://drive.google.com/drive/folders/abc123');
  await t.getByText('学生の画面での見え方').click();
  await expect(t.locator('.msg-preview .link-card')).toHaveCount(1);
  await expect(t.locator('.msg-preview')).toContainText('<script>'); // 文字のまま
  expect(await t.locator('.msg-preview a[href^="javascript:"]').count()).toBe(0);
  expect(await t.locator('.msg-preview script, .msg-preview img[src="x"]').count()).toBe(0);
  expect(await t.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  await t.goto('/teacher/report/A');
  await expect(t.getByRole('button', { name: 'Excelで保存(.xlsx)' })).toBeVisible();
  const dl = t.waitForEvent('download', { timeout: 20_000 }).catch(() => null);
  await t.getByRole('button', { name: 'Excelで保存(.xlsx)' }).click();
  const got = await dl;
  const msgs = await t.locator('.error').allInnerTexts();
  const seen = await t.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
  expect(got, `Excel の書き出し: ${msgs.join(' / ')} / ブロック: ${seen.join(' / ')} / ${violations.join(' | ')}`).not.toBeNull();
  expect(got!.suggestedFilename()).toMatch(/\.xlsx$/);

  // ブロックされた読み込みが、ない (Google のフォント・サムネイルなど許可したものも、止められていない)
  const blocked = [...(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)), ...(await t.evaluate(() => (window as unknown as { __csp: string[] }).__csp))];
  expect(blocked, `方針にブロックされたもの: ${blocked.join(' / ')}`).toEqual([]);
  expect(violations, violations.join('\n')).toEqual([]);
});
