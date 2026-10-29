import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { login } from './helpers';

test.describe.serial('ミッション・WBS外の作業・ガントチャートで編集', () => {
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
    // 既定では閉じている。開くと中身が見え、開き方は覚えている
    await expect(page.getByText('全員が、今週の作業を更新する')).toBeHidden();
    await page.getByRole('heading', { name: /チームの今週のミッション/ }).click();
    await expect(page.getByText('全員が、今週の作業を更新する')).toBeVisible();
    await page.reload();
    await expect(page.getByText('全員が、今週の作業を更新する')).toBeVisible();
    await page.getByRole('heading', { name: /チームの今週のミッション/ }).click(); // 閉じて戻す
    await expect(page.getByText('自分の担当タスクに、期間を入れる')).toBeVisible();
    // 今日のミッションも、見出しを押して閉じられる。開き方は覚えている
    await page.getByRole('heading', { name: /今日のミッション/ }).click();
    await expect(page.getByText('自分の担当タスクに、期間を入れる')).toBeHidden();
    await page.reload();
    await expect(page.getByText('自分の担当タスクに、期間を入れる')).toBeHidden();
    await page.getByRole('heading', { name: /今日のミッション/ }).click();
    await expect(page.getByText('自分の担当タスクに、期間を入れる')).toBeVisible();
  });

  test('ガントチャート: 空の行をなぞって期間が入る。バーをタップして状態を変える。タスクを追加できる', async ({ page }) => {
    await login(page, 'a1@trident.ac.jp');
    await page.getByRole('link', { name: 'WBS・ガントチャート', exact: true }).click();
    await page.getByRole('button', { name: /ガントチャートを大きく/ }).click();
    await page.getByLabel('ガントチャートで編集する').check();
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

    // ドラッグしたタスクは、そのまま選ばれる。学生には、状態を変えるボタンは出ない (作業ログで更新する)
    await expect(page.getByLabel('追加するタスクの名前')).toBeVisible();
    await expect(page.getByRole('group', { name: '状態' })).toHaveCount(0);

    // タスクの追加
    await page.getByLabel('追加するタスクの名前').fill('ガントチャートから追加したタスク');
    await page.getByRole('button', { name: '追加', exact: true }).click();
    await expect(page.locator('.gantt-row', { hasText: 'ガントチャートから追加したタスク' })).toBeVisible();

    // 行の「＋」から、その場で追加できる。続けて入れられる
    await page.getByRole('button', { name: /「なぞって期間を入れるタスク」にタスクを中に追加/ }).click();
    const inline = page.getByLabel('ここに追加するタスクの名前');
    await inline.fill('行の＋から足した1つめ');
    await inline.press('Enter');
    await inline.fill('行の＋から足した2つめ');
    await inline.press('Enter');
    await expect(page.locator('.gantt-row', { hasText: '行の＋から足した1つめ' })).toBeVisible();
    await expect(page.locator('.gantt-row', { hasText: '行の＋から足した2つめ' })).toBeVisible();
  });

  test('作業ログ: WBSにない作業を書いて提出すると、WBSに「後追い」のタスクができる', async ({ page }) => {
    await login(page, 'a1@trident.ac.jp');
    await page.getByRole('link', { name: '作業ログ', exact: true }).click();
    await page.getByRole('button', { name: '＋ WBSにない作業をした' }).click();
    await page.getByLabel('WBSにない作業の名前').fill('取引先へのAPI仕様の確認メール');
    await page.getByRole('group', { name: 'WBSにない作業の結果' }).getByRole('button', { name: '完了した' }).click();
    await page.getByLabel('WBSにない作業の説明').fill('API仕様の不明点を3つ整理して、先方へメールを送った。');
    // ガントチャートで更新したタスクは、先に選ばれている。説明を書かないものは、選びを外す
    const preselected = page.locator('.dcard.on:not(.adhoc-card):not(.r-kind) .seg-btn.on');
    while (await preselected.count() > 0) await preselected.first().click();
    await page.getByLabel('次にやること', { exact: true }).fill('取引先の回答を待って、API仕様書を更新する。');
    const submit = page.getByRole('button', { name: /作業ログを(送信|更新する)/ });
    await submit.click();
    await expect(page.getByText(/提出しました|更新しました/).first()).toBeVisible({ timeout: 15000 });

    await page.getByRole('link', { name: 'WBS・ガントチャート', exact: true }).click();
    await expect(page.locator('input.title-input[value="WBS外の作業(あとから追加)"]')).toBeVisible();
    await expect(page.locator('input.title-input[value="取引先へのAPI仕様の確認メール"]')).toBeVisible();
    await expect(page.locator('.badge.adhoc').first()).toBeVisible();
  });

  test('PJ分析: 概況・ガントチャート・WBSが出て、Excelをダウンロードできる。ミーティング画面にも分析が出る', async ({ page }) => {
    await login(page, 'a1@trident.ac.jp');
    await page.getByRole('link', { name: 'PJ分析', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Aチーム プロジェクト概況レポート' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '概況と分析' })).toBeVisible();
    await page.locator('details.report-gantt summary').click(); // ふだんは閉じている
    await expect(page.locator('.report .no-print .gantt-row').first()).toBeVisible();
    await page.locator('.report .no-print details', { hasText: 'WBS' }).last().locator('summary').click();
    await expect(page.locator('.report .no-print .wbs-print tbody tr').first()).toBeVisible();
    await expect(page.locator('.report .no-print .wbs-print').getByText('WBS外の作業(あとから追加)')).toBeVisible();
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Excelで保存(.xlsx)' }).click();
    const file = await dl;
    expect(file.suggestedFilename()).toMatch(/^sotsuken-A-report-\d{4}-\d{2}-\d{2}\.xlsx$/);
    await page.screenshot({ path: 'e2e-shots/report.png', fullPage: true });

    await page.getByRole('link', { name: 'ミーティングを始める' }).click();
    await page.locator('.step').nth(1).click();
    await expect(page.getByRole('heading', { name: /PJ分析/ })).toBeVisible();
    await expect(page.locator('.analysis-card .meter')).toBeVisible();
  });

  test('教員: チーム詳細にPJ分析タブがある', async ({ page }) => {
    await login(page, 'teacher@trident.ac.jp');
    await page.goto('/teacher/team/A');
    await page.getByRole('button', { name: 'PJ分析', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Aチーム プロジェクト概況レポート' })).toBeVisible();
  });

  test('ありがとう: ホームからスタンプを1タップで送れて、受け取った人には新着が出る', async ({ page, browser }) => {
    await login(page, 'a2@trident.ac.jp');
    const card = page.locator('.thanks-card');
    await expect(card).toBeVisible();
    // 新着や、伝えるきっかけがなければ、閉じている。開いてから使う
    if (!(await card.evaluate((el) => (el as HTMLDetailsElement).open))) await card.locator('summary').click();
    await card.locator('.chips .chip-btn').first().click();
    await card.locator('.chips + .stamps').getByRole('button', { name: /助かりました/ }).click();
    await expect(card.locator('.chips .chip-btn', { hasText: '✓' })).toHaveCount(1);
    await expect(card).toContainText(/今日あと\d回/);

    const s = await browser.newPage();
    await login(s, 'a1@trident.ac.jp');
    await expect(s.locator('.thanks-card .received li.fresh')).toContainText('助かりました');
    await s.close();
  });

  test('アクセス履歴: 学生が開いた記録が、教員だけに見える', async ({ browser }) => {
    // 学生が画面を開く (開いた直後に、記録が書かれる)
    const sp = await browser.newPage();
    await login(sp, 'a1@trident.ac.jp');
    await sp.getByRole('link', { name: 'WBS・ガントチャート', exact: true }).click();
    await sp.waitForTimeout(1500);
    // 学生には、アクセス履歴の画面が出ない (ナビにも出ない)
    await expect(sp.getByRole('link', { name: 'アクセス', exact: true })).toHaveCount(0);

    const t = await browser.newPage();
    await login(t, 'teacher@trident.ac.jp');
    await t.getByRole('link', { name: '利用状況', exact: true }).click();
    await t.getByRole('button', { name: 'アクセス', exact: true }).click();
    await expect(t.getByRole('heading', { name: 'アクセス履歴' })).toBeVisible();
    const row = t.locator('table.access tbody tr', { hasText: 'A1' }).first();
    await expect(row).toContainText('今日');
    await row.getByRole('button').click();
    await expect(t.locator('tr.access-detail')).toContainText('開いた');
    await expect(t.locator('tr.access-detail')).toContainText('ホーム');
    await sp.close(); await t.close();
  });

  test('教員: 作業ログの一覧を、チームごと・個人ごとに、日付・文字で絞り込んで見られる。カレンダーは、設定の中にある', async ({ browser }) => {
    const t = await browser.newPage();
    await login(t, 'teacher@trident.ac.jp');
    await t.getByRole('link', { name: '利用状況', exact: true }).click();
    await t.getByRole('button', { name: '作業ログ', exact: true }).click();
    await expect(t.getByRole('heading', { name: '作業ログ', exact: true })).toBeVisible();
    await t.getByLabel('チーム', { exact: true }).selectOption('A');
    await expect(t.locator('.log-section')).toHaveCount(1);
    await expect(t.getByText('API仕様の不明点を3つ整理して')).toBeVisible();
    await t.getByLabel('文字で絞り込む').fill('存在しない文字');
    await expect(t.getByText('条件に合う作業ログはありません。')).toBeVisible();
    await t.getByLabel('文字で絞り込む').fill('不明点');
    await expect(t.getByText('API仕様の不明点を3つ整理して')).toBeVisible();
    await t.getByRole('button', { name: '個人ごと' }).click();
    await expect(t.locator('.log-person').first()).toBeVisible();
    await t.getByLabel('個人', { exact: true }).selectOption({ index: 1 });
    await expect(t.locator('.log-person')).toHaveCount(1);
    // カレンダーは、ナビになく、設定の中の1項目
    await expect(t.getByRole('link', { name: 'カレンダー', exact: true })).toHaveCount(0);
    await t.getByRole('link', { name: '設定', exact: true }).click();
    await t.getByRole('button', { name: 'カレンダー', exact: true }).click();
    await expect(t.getByRole('heading', { name: '授業日とミーティング' })).toBeVisible();
    await t.close();
  });

  test('教員: 利用状況の分析で、メンバーごとの関与・貢献の数を、キックオフからの通算などで見られる', async ({ browser }) => {
    const t = await browser.newPage();
    await login(t, 'teacher@trident.ac.jp');
    // 作業ログ・アクセスは、「利用状況」にまとまっている (ナビには別に出ない)
    await expect(t.getByRole('link', { name: 'アクセス', exact: true })).toHaveCount(0);
    await t.getByRole('link', { name: '利用状況', exact: true }).click();
    await expect(t.getByRole('heading', { name: '利用状況', exact: true })).toBeVisible();
    await expect(t.getByText('チームを選ぶと、メンバーごとの数が出ます。')).toBeVisible();
    await t.getByLabel('分析するチーム').selectOption('A');
    await expect(t.getByRole('heading', { name: /Aチーム/ })).toBeVisible();
    await expect(t.getByRole('columnheader', { name: /作業ログ/ })).toBeVisible();
    await expect(t.locator('table.facts tbody tr').first()).toBeVisible();
    await t.getByLabel('期間').selectOption('d7');
    await expect(t.locator('table.facts tbody tr').first()).toBeVisible();
    const [dl] = await Promise.all([t.waitForEvent('download'), t.getByRole('button', { name: 'CSVで書き出す' }).click()]);
    expect(dl.suggestedFilename()).toMatch(/^利用状況_Aチーム_.*\.csv$/);
    // 古いURLも、利用状況の中を開く
    await t.goto('/teacher/logs');
    await expect(t.getByRole('heading', { name: '作業ログ', exact: true })).toBeVisible();
    await t.close();
  });

  test('利用ガイド: 初回に自動で出て、あとからヘッダーの「ガイド」で画面に合わせて開ける', async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await login(page, 'a2@trident.ac.jp', { keepGuide: true });
    const dialog = page.getByRole('dialog', { name: '利用ガイド' });
    await expect(dialog).toBeVisible(); // 初回(案内の確認のあと)に自動で出る
    await expect(dialog).toContainText('このアプリでできること');
    await dialog.getByRole('button', { name: '次へ →' }).click();
    await expect(dialog).toContainText('ホーム: まずここを見る');
    await page.getByRole('button', { name: 'ガイドを閉じる' }).click();
    await expect(dialog).toHaveCount(0);

    // 次回からは、自動では出ない
    await page.reload();
    await expect(page.getByRole('heading', { name: /今日のミッション/ })).toBeVisible();
    await expect(dialog).toHaveCount(0);

    // 作業ログの画面で開くと、作業ログの説明から始まる。「こんなとき」から、場面のやり方と画面への移動ができる
    await page.getByRole('link', { name: '作業ログ', exact: true }).click();
    await page.getByRole('button', { name: /ガイド/ }).first().click();
    await expect(dialog).toContainText('作業ログ: やったことを書く');
    await dialog.getByRole('tab', { name: 'こんなとき' }).click();
    await dialog.getByRole('button', { name: 'WBSにない作業をしたとき' }).click();
    await expect(dialog).toContainText('WBSにタスクとして追加されます');
    await dialog.getByRole('button', { name: '作業ログを開く' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '作業ログ', exact: true })).toBeVisible();
    await page.close();
  });

  test('お気に入りの案内: ホームに出て、「追加しました」で出なくなる。「あとで」でも一時的に消える', async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    await login(page, 'a2@trident.ac.jp');
    const card = page.getByRole('region', { name: 'お気に入りに追加' });
    await expect(card).toBeVisible();
    await card.getByText(/での追加のしかた/).click();
    await expect(card).toContainText('/');
    // ブラウザが「インストールできる」と知らせたら、ボタンから「ホーム画面に追加」できる
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
      e.prompt = async () => undefined; e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    });
    await expect(card.getByRole('button', { name: 'ホーム画面に追加' })).toBeVisible();
    // パソコンでは、デスクトップに置くためのショートカットのファイルを保存できる
    const [dl] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'デスクトップ用ショートカットを保存' }).click()]);
    // (ヘッドレスのChromiumは、日本語のファイル名を「download」にしてしまうので、名前ではなく中身を確かめる)
    expect(readFileSync((await dl.path()) as string, 'utf8')).toMatch(/\[InternetShortcut\]\r\nURL=https?:\/\//);
    await expect(card.getByRole('status')).toContainText('デスクトップにドラッグ');
    await card.getByRole('button', { name: /あとで/ }).click();
    await expect(card).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: /今日のミッション/ })).toBeVisible();
    await expect(card).toHaveCount(0); // 3日間は出ない
    // 追加した → 保存値を「あとで」前の状態に戻して、「追加した」を試す
    await page.evaluate(() => localStorage.removeItem('bookmark:a2@trident.ac.jp'));
    await page.reload();
    await card.getByRole('button', { name: '追加しました' }).click();
    await expect(card).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: /今日のミッション/ })).toBeVisible();
    await expect(card).toHaveCount(0);

    // 「ホーム画面に追加」を押して、追加が受け入れられたら、出なくなる
    await page.evaluate(() => localStorage.removeItem('bookmark:a2@trident.ac.jp'));
    await page.reload();
    await expect(card).toBeVisible();
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
      e.prompt = async () => undefined; e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    });
    await card.getByRole('button', { name: 'ホーム画面に追加' }).click();
    await expect(card).toHaveCount(0);
    await page.close();
  });
});
