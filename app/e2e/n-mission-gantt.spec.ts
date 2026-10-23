import { expect, test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { login } from './helpers';

test.describe.serial('ミッション・WBS外の作業・ガントで編集', () => {
  test.beforeAll(async () => {
    const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-sotsuken' }));
    await db.doc('teams/A/tasks/mg-1').set({
      title: 'なぞって期間を入れるタスク', detail: '', parentId: null, depth: 1, order: 88888, status: 'todo', assignees: ['A1'], links: [], source: 'user',
      createdBy: 'teacher', updatedBy: 'teacher', createdAt: 1, updatedAt: 1, deleted: false, deletedAt: null, startDate: null, endDate: null,
    });
  });

  test('ホーム: 今日のミッションとチームの今週のミッションが出る', async ({ page }) => {
    await login(page, 'a1@trident.ac.jp');
    await expect(page.getByRole('heading', { name: /今日のミッション/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /チームの今週のミッション/ })).toBeVisible();
    await expect(page.getByText('自分の担当タスクに、期間を入れる')).toBeVisible();
  });

  test('ガント: 空の行をなぞって期間が入る。バーをタップして状態を変える。タスクを追加できる', async ({ page }) => {
    await login(page, 'a1@trident.ac.jp');
    await page.getByRole('link', { name: 'ガント', exact: true }).click();
    await page.getByLabel('ガントで編集する').check();
    const row = page.locator('.gantt-row', { hasText: 'なぞって期間を入れるタスク' });
    await expect(row.locator('.gantt-bar')).toHaveCount(0);
    // 横にスクロールされていても、見えている範囲をなぞる
    await row.locator('.gantt-track').scrollIntoViewIfNeeded();
    const vis = await row.locator('.gantt-track').evaluate((el) => {
      const t = el.getBoundingClientRect(); const c = el.closest('.gantt')!.getBoundingClientRect();
      const name = el.closest('.gantt-row')!.querySelector('.gantt-name')!.getBoundingClientRect();
      const left = Math.max(t.left, c.left, name.right); const right = Math.min(t.right, c.right);
      return { x: left, w: right - left, y: t.top + t.height / 2 };
    });
    await page.mouse.move(vis.x + vis.w * 0.3, vis.y);
    await page.mouse.down();
    await page.mouse.move(vis.x + vis.w * 0.5, vis.y, { steps: 8 });
    await page.mouse.up();
    await expect(row.locator('.gantt-bar')).toHaveCount(1);

    // バーを右へドラッグして移動
    await row.locator('.gantt-bar').scrollIntoViewIfNeeded();
    const before = (await row.locator('.gantt-bar').boundingBox())!;
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 60, before.y + before.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await row.locator('.gantt-bar').boundingBox())!.x).toBeGreaterThan(before.x + 20);

    // タップで選択 → 状態を「進行中」に
    // ドラッグしたタスクは、そのまま選ばれる。名前のタップでも選べる
    await expect(page.getByRole('group', { name: '状態' })).toBeVisible();
    await page.getByRole('group', { name: '状態' }).getByRole('button', { name: '進行中' }).click();
    await expect(row.locator('.gantt-bar.doing')).toHaveCount(1);

    // タスクの追加
    await page.getByLabel('追加するタスクの名前').fill('ガントから追加したタスク');
    await page.getByRole('button', { name: '追加', exact: true }).click();
    await expect(page.locator('.gantt-row', { hasText: 'ガントから追加したタスク' })).toBeVisible();
  });

  test('日報: WBSにない作業を書いて提出すると、WBSに「後追い」のタスクができる', async ({ page }) => {
    await login(page, 'a1@trident.ac.jp');
    await page.getByRole('link', { name: '日報', exact: true }).click();
    await page.getByRole('button', { name: '＋ WBSにない作業をした' }).click();
    await page.getByLabel('WBSにない作業の名前').fill('取引先へのAPI仕様の確認メール');
    await page.getByRole('group', { name: 'WBSにない作業の結果' }).getByRole('button', { name: '完了した' }).click();
    await page.getByLabel('WBSにない作業の説明').fill('API仕様の不明点を3つ整理して、先方へメールを送った。');
    // ガントで更新したタスクは、先に選ばれている。説明を書かないものは、選びを外す
    const preselected = page.locator('.dcard.on:not(.adhoc-card):not(.r-kind) .seg-btn.on');
    while (await preselected.count() > 0) await preselected.first().click();
    await page.getByLabel('次にやること', { exact: true }).fill('取引先の回答を待って、API仕様書を更新する。');
    const submit = page.getByRole('button', { name: /日報を(提出|更新)する/ });
    await submit.click();
    await expect(page.getByText(/提出しました|更新しました/).first()).toBeVisible({ timeout: 15000 });

    await page.getByRole('link', { name: 'WBS', exact: true }).click();
    await expect(page.locator('input.title-input[value="WBS外の作業(あとから追加)"]')).toBeVisible();
    await expect(page.locator('input.title-input[value="取引先へのAPI仕様の確認メール"]')).toBeVisible();
    await expect(page.locator('.badge.adhoc').first()).toBeVisible();
  });

  test('報告書: 概況・ガント・WBSが出て、Excelをダウンロードできる。ミーティング画面にも分析が出る', async ({ page }) => {
    await login(page, 'a1@trident.ac.jp');
    await page.getByRole('link', { name: '報告書', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Aチーム プロジェクト概況レポート' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '概況と分析' })).toBeVisible();
    await expect(page.locator('.report .gantt-row').first()).toBeVisible();
    await expect(page.locator('.wbs-print tbody tr').first()).toBeVisible();
    await expect(page.locator('.wbs-print').getByText('WBS外の作業(あとから追加)')).toBeVisible();
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Excelで保存(.xlsx)' }).click();
    const file = await dl;
    expect(file.suggestedFilename()).toMatch(/^sotsuken-A-report-\d{4}-\d{2}-\d{2}\.xlsx$/);
    await page.screenshot({ path: 'e2e-shots/report.png', fullPage: true });

    await page.getByRole('link', { name: 'ミーティング', exact: true }).click();
    await page.locator('.step').nth(1).click();
    await expect(page.getByRole('heading', { name: /プロジェクト分析/ })).toBeVisible();
    await expect(page.locator('.analysis-card .meter')).toBeVisible();
  });

  test('教員: チーム詳細に報告書タブがある', async ({ page }) => {
    await login(page, 'teacher@trident.ac.jp');
    await page.goto('/teacher/team/A');
    await page.getByRole('button', { name: '報告書', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Aチーム プロジェクト概況レポート' })).toBeVisible();
  });

  test('ありがとう: ホームからスタンプを1タップで送れて、受け取った人には新着が出る', async ({ page, browser }) => {
    await login(page, 'a2@trident.ac.jp');
    const card = page.locator('.thanks-card');
    await expect(card).toBeVisible();
    await card.locator('.chips .chip-btn').first().click();
    await card.locator('.chips + .stamps').getByRole('button', { name: /助かった/ }).click();
    await expect(card.locator('.chips .chip-btn', { hasText: '✓' })).toHaveCount(1);
    await expect(card).toContainText(/今日あと\d回/);

    const s = await browser.newPage();
    await login(s, 'a1@trident.ac.jp');
    await expect(s.locator('.thanks-card .received li.fresh')).toContainText('助かった');
    await s.close();
  });
});
