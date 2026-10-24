import { expect, test } from '@playwright/test';
import { login } from './helpers';

const TEACHER = 'teacher@trident.ac.jp';
const NEW = 'new1@trident.ac.jp';

test.describe.serial('名簿の修正と、教員の表示名', () => {
  test('教員の表示名を変えると、画面にすぐ反映される', async ({ page }) => {
    await login(page, TEACHER);
    await page.getByRole('link', { name: '設定' }).click();
    await page.getByLabel(/あなたの表示名/).fill('滝川');
    await page.getByRole('button', { name: '表示名を保存' }).click();
    await expect(page.getByText('保存しました')).toBeVisible(); // サーバーへの保存が終わってから出る
    await expect(page.getByText('滝川(教員)')).toBeVisible();
    await page.reload();
    await expect(page.getByText('滝川(教員)')).toBeVisible();
  });

  test('CSV で学生を登録 → 苗字の変更 → チームの変更 → 名簿から外す', async ({ browser }) => {
    const t = await (await browser.newContext()).newPage();
    await login(t, TEACHER);
    await t.getByRole('link', { name: '設定' }).click();
    await t.getByRole('button', { name: '名簿', exact: true }).click();

    // 登録 (新人: Bチーム)
    await t.getByLabel(/CSV を貼り付け/).fill(`新人,${NEW},B`);
    await t.getByRole('button', { name: '1名を登録する' }).click();
    await expect(t.getByText('1名を登録しました')).toBeVisible();
    const row = t.locator('tr', { hasText: NEW });
    await expect(row).toContainText('B2'); // Bチームの2人目 (長田は B1)

    // 学生がログインしている状態で、苗字を変更 → 学生の画面にそのまま反映される
    const s = await (await browser.newContext()).newPage();
    await login(s, NEW);
    await expect(s.getByText('新人(Bチーム)')).toBeVisible();

    await row.getByRole('textbox').fill('新人改');
    await row.getByRole('button', { name: '保存' }).click();
    await expect(t.getByText('苗字を「新人改」に変更しました')).toBeVisible();
    await expect(s.getByText('新人改(Bチーム)')).toBeVisible();
    await t.goto('/teacher/team/B');
    await expect(t.getByText('長田・新人改')).toBeVisible(); // チームのメンバー表示にも反映
    await t.getByRole('link', { name: '設定' }).click();
    await t.getByRole('button', { name: '名簿', exact: true }).click();

    // チームの変更 (B → A): 学生IDが付け替わる。学生は、画面を更新すると、新しいチームの画面になる
    // (移動前のチームのデータの購読が拒否されるため、ログイン中の画面が切り替わるまでには時間がかかることがある)
    await t.locator('tr', { hasText: NEW }).getByLabel('新人改のチーム').selectOption('A');
    await expect(t.getByText(/Aチームに移しました/)).toBeVisible();
    await expect(t.locator('tr', { hasText: NEW })).toContainText('A3'); // A1, A2 の次
    await s.reload();
    await expect(s.getByText('新人改(Aチーム)')).toBeVisible();
    await expect(s.getByText('岩田・近内・新人改', { exact: true })).toBeVisible(); // 新しいチームのメンバー表示
    await t.goto('/teacher/team/A');
    await expect(t.getByText('岩田・近内・新人改', { exact: true })).toBeVisible();
    await t.getByRole('link', { name: '設定' }).click();
    await t.getByRole('button', { name: '名簿', exact: true }).click();

    // 名簿から外す (2段階) → 学生は、画面を更新すると入れない。メンバー表からも外れる
    const r = t.locator('tr', { hasText: NEW });
    await r.getByRole('button', { name: '名簿から外す' }).click();
    await r.getByRole('button', { name: '本当に外す' }).click();
    await expect(t.getByText('新人改さんを名簿から外しました')).toBeVisible();
    await expect(t.locator('tr', { hasText: NEW })).toHaveCount(0);
    await s.reload();
    await expect(s.getByText('名簿に登録されていません')).toBeVisible();
    await t.goto('/teacher/team/A');
    await expect(t.getByText('岩田・近内', { exact: true })).toBeVisible();
  });
});
