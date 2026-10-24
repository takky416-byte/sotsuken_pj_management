import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { login, row } from './helpers';

// 2人の学生 (同じAチーム) が、WBS を同時に編集する場面。回線の切断を使って「ほぼ同時」を再現する。
// b-journey でキックオフ済みの A チームを使う。

type User = { ctx: BrowserContext; p: Page };
let a: User;
let b: User;

async function open(browser: Browser, email: string): Promise<User> {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await login(p, email);
  await p.getByRole('link', { name: 'WBS・ガントチャート', exact: true }).click();
  await p.getByRole('button', { name: '編集モードにする' }).click();
  await row(p, '要件定義').waitFor();
  return { ctx, p };
}

/** 画面に表示されているタイトル入力欄のうち、いま title の値を持つものの位置。入力中は値が変わるので、位置で扱う。 */
async function titleBox(p: Page, title: string) {
  const idx = await p.locator('input.title-input').evaluateAll((els, t) => (els as HTMLInputElement[]).findIndex((e) => e.value === t), title);
  expect(idx).toBeGreaterThanOrEqual(0);
  return p.locator('input.title-input').nth(idx);
}

/** a が追加したタスクが、両方の画面に出るのを待つ */
async function addTask(title: string) {
  const i = a.p.getByPlaceholder(/^タスクを追加/);
  await i.fill(title);
  await i.press('Enter');
  await row(a.p, title).waitFor();
  await row(b.p, title).waitFor();
}

test.describe.serial('同時編集', () => {
  test.beforeAll(async ({ browser }) => {
    a = await open(browser, 'a1@trident.ac.jp');
    b = await open(browser, 'a2@trident.ac.jp');
  });

  test('同時に、別々のタスクを追加すると、両方追加され、全員に同じ順序で表示される', async () => {
    await Promise.all([
      (async () => { const i = a.p.getByPlaceholder(/^タスクを追加/); await i.fill('A同時追加'); await i.press('Enter'); })(),
      (async () => { const i = b.p.getByPlaceholder(/^タスクを追加/); await i.fill('B同時追加'); await i.press('Enter'); })(),
    ]);
    for (const u of [a, b]) { await row(u.p, 'A同時追加').waitFor(); await row(u.p, 'B同時追加').waitFor(); }
    const order = (p: Page) => p.locator('input.title-input').evaluateAll((els) => (els as HTMLInputElement[]).map((e) => e.value).filter((v) => v.includes('同時追加')));
    expect(await order(a.p)).toEqual(await order(b.p));
  });

  test('担当を、2人がほぼ同時に別々の人に付けても、両方残る', async () => {
    await addTask('担当の競合');
    for (const u of [a, b]) await row(u.p, '担当の競合').getByRole('button', { name: '詳細' }).click();
    await b.ctx.setOffline(true);
    await b.p.getByRole('checkbox', { name: '近内' }).click();
    await a.p.getByRole('checkbox', { name: '岩田' }).click();
    await a.p.waitForTimeout(800);
    await b.ctx.setOffline(false);
    for (const u of [a, b]) await expect(u.p.locator('.chip.on')).toHaveCount(2, { timeout: 15_000 }); // 岩田と近内
    // リンクも同じ (配列を丸ごと書き換えない)
    await b.ctx.setOffline(true);
    await b.p.getByPlaceholder('https://...').fill('https://example.com/b');
    await b.p.getByRole('button', { name: '追加', exact: true }).click();
    await a.p.getByPlaceholder('https://...').fill('https://example.com/a');
    await a.p.getByRole('button', { name: '追加', exact: true }).click();
    await a.p.waitForTimeout(800);
    await b.ctx.setOffline(false);
    for (const u of [a, b]) await expect(u.p.locator('.detail .link-row')).toHaveCount(2, { timeout: 15_000 });
    // 外す (他の人が足したリンクを消さない)
    await a.p.locator('.detail .link-row', { hasText: 'example.com/a' }).getByRole('button', { name: '外す' }).click();
    for (const u of [a, b]) {
      await expect(u.p.locator('.detail .link-row')).toHaveCount(1, { timeout: 15_000 });
      await expect(u.p.locator('.detail .link-row')).toContainText('example.com/b');
    }
  });

  test('親の削除と、その下への追加が重なっても、タスクは迷子にならず、最上位に移せる', async () => {
    await addTask('親P');
    // B は回線が切れている間に、親P の下へ子を追加。その間に A が親P を削除する
    await b.ctx.setOffline(true);
    await row(b.p, '親P').getByRole('button', { name: '子タスクを追加' }).click();
    await b.p.getByPlaceholder(/の下に追加/).fill('B子');
    await b.p.getByPlaceholder(/の下に追加/).press('Enter');
    await row(a.p, '親P').getByRole('button', { name: '詳細' }).click();
    await a.p.getByRole('button', { name: '削除', exact: true }).click();
    await a.p.waitForTimeout(800);
    await b.ctx.setOffline(false);

    for (const u of [a, b]) {
      await expect(u.p.locator('.orphan')).toContainText('B子', { timeout: 15_000 }); // 見えなくならない
      await expect(u.p.locator('.orphan')).toContainText('親P');
    }
    await a.p.locator('.orphan').getByRole('button', { name: '最上位に移す' }).click();
    for (const u of [a, b]) {
      await expect(row(u.p, 'B子')).toBeVisible({ timeout: 15_000 });
      await expect(u.p.locator('.orphan')).toHaveCount(0);
    }
  });

  test('入力中のタスク名は、他の人の変更で書き換わらない。保存するときに、どちらにするか選べる', async () => {
    await addTask('名前の競合');
    const ai = await titleBox(a.p, '名前の競合');
    await ai.click();
    await ai.press('End');
    await ai.pressSequentially('(Aが入力中)');
    const bi = await titleBox(b.p, '名前の競合');
    await bi.fill('名前の競合をBが変更');
    await bi.blur();
    await a.p.waitForTimeout(2000);
    await expect(ai).toHaveValue('名前の競合(Aが入力中)'); // 入力中の内容は、そのまま

    await ai.blur(); // 保存しようとすると、競合を知らせる
    const notice = a.p.locator('.conflict');
    await expect(notice).toContainText('さんが先にタスク名を「名前の競合をBが変更」に変更しました');
    await notice.getByRole('button', { name: '自分の内容にする' }).click();
    await expect(notice).toHaveCount(0);
    await expect(row(b.p, '名前の競合(Aが入力中)')).toBeVisible({ timeout: 15_000 }); // 自分の内容が保存された

    // もう一度。今度は相手の内容にする
    const ai2 = await titleBox(a.p, '名前の競合(Aが入力中)');
    await ai2.click();
    await ai2.press('End');
    await ai2.pressSequentially('X');
    const bi2 = await titleBox(b.p, '名前の競合(Aが入力中)');
    await bi2.fill('Bの最終案');
    await bi2.blur();
    await a.p.waitForTimeout(1500);
    await ai2.blur();
    await a.p.locator('.conflict').getByRole('button', { name: /さんの内容にする/ }).click();
    await expect(row(a.p, 'Bの最終案')).toBeVisible();
    await expect(row(b.p, 'Bの最終案')).toBeVisible();
  });

  test('入力を始める前なら、他の人の変更はそのまま反映される', async () => {
    const bi = await titleBox(b.p, 'Bの最終案');
    await bi.fill('Bがさらに変更');
    await bi.blur();
    await expect(row(a.p, 'Bがさらに変更')).toBeVisible({ timeout: 15_000 });
    await expect(a.p.locator('.conflict')).toHaveCount(0);
  });

  test('詳細欄も、入力中は書き換わらず、競合を選べる', async () => {
    await row(a.p, 'Bがさらに変更').getByRole('button', { name: '詳細' }).click();
    await row(b.p, 'Bがさらに変更').getByRole('button', { name: '詳細' }).click();
    const am = a.p.locator('.detail textarea');
    const bm = b.p.locator('.detail textarea');
    await am.click();
    await am.pressSequentially('Aのメモ');
    await bm.fill('Bのメモ');
    await bm.blur();
    await a.p.waitForTimeout(2000);
    await expect(am).toHaveValue('Aのメモ');
    await am.blur();
    await expect(a.p.locator('.conflict')).toContainText('詳細を「Bのメモ」に変更しました');
    await a.p.locator('.conflict').getByRole('button', { name: /さんの内容にする/ }).click();
    await expect(am).toHaveValue('Bのメモ');
  });
});
