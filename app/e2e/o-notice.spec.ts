import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe.serial('チームへのお知らせ', () => {
  test('教員がメッセージと提出先を設定すると、学生のホームに出る。消すと出なくなる', async ({ browser }) => {
    const t = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await login(t, 'teacher@trident.ac.jp');
    await t.goto('/teacher/team/A');
    await t.getByLabel(/^メッセージ/).fill('来週は中間確認をします。');
    await t.getByRole('button', { name: 'メッセージを送る' }).click();
    await expect(t.getByText('メッセージを送りました')).toBeVisible();
    await t.getByLabel(/成果物の提出先/).fill('not a url');
    await expect(t.getByRole('button', { name: '提出先を保存' })).toBeDisabled();
    await t.getByLabel(/成果物の提出先/).fill('https://drive.google.com/drive/folders/abc123');
    await t.getByRole('button', { name: '提出先を保存' }).click();
    await expect(t.getByText('提出先を保存しました')).toBeVisible();

    const s = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await login(s, 'a1@trident.ac.jp');
    await expect(s.getByText('来週は中間確認をします。')).toBeVisible();
    const link = s.getByRole('link', { name: /成果物を提出/ });
    await expect(link).toHaveAttribute('href', 'https://drive.google.com/drive/folders/abc123');

    await s.screenshot({ path: 'e2e-shots/student-home-notice.png' });
    // 他のチームの学生には、出ない
    const o = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await login(o, 'b1@trident.ac.jp');
    await expect(o.getByText('来週は中間確認をします。')).toHaveCount(0);

    await t.getByRole('button', { name: 'メッセージを消す' }).click();
    await expect(t.getByText('メッセージを消しました')).toBeVisible();
    await s.reload();
    await expect(s.getByText('来週は中間確認をします。')).toHaveCount(0);
  });

  test('教員が、全チームにまとめてメッセージを送ると、学生のホームに出る。一覧は要確認の設定で並ぶ', async ({ browser }) => {
    const t = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await login(t, 'teacher@trident.ac.jp');
    await t.goto('/teacher');
    await expect(t.getByLabel('要確認のチームを上に並べる')).toBeChecked();
    await t.getByText('全チームにメッセージを送る').click();
    await t.getByLabel('全チームへのメッセージ').fill('全チームへ: 提出物の確認をします。');
    await t.getByRole('button', { name: /チームに送る/ }).click();
    await expect(t.getByText(/チームに送りました/)).toBeVisible();

    const s = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await login(s, 'a1@trident.ac.jp');
    await expect(s.getByText('全チームへ: 提出物の確認をします。')).toBeVisible();

    await t.getByLabel('全チームへのメッセージ').fill('');
    await t.getByRole('button', { name: /チームに送る/ }).click();
    await expect(t.getByText(/メッセージを消しました/)).toBeVisible();
  });

  test('WBS: 自分の担当だけ・すべて閉じる/開く', async ({ page }) => {
    await login(page, 'a1@trident.ac.jp');
    await page.getByRole('link', { name: 'WBS・ガントチャート', exact: true }).click();
    await page.locator('.wbs-row').first().waitFor();
    const all = await page.locator('.wbs-row').count();
    await page.getByRole('button', { name: 'すべて閉じる' }).click();
    const closed = await page.locator('.wbs-row').count();
    expect(closed).toBeLessThan(all);
    await page.getByRole('button', { name: 'すべて開く' }).click();
    await expect(page.locator('.wbs-row')).toHaveCount(all);
    await page.getByLabel('自分の担当だけ').check();
    expect(await page.locator('.wbs-row').count()).toBeLessThanOrEqual(all);
    await page.getByLabel('自分の担当だけ').uncheck();
    await expect(page.locator('.wbs-row')).toHaveCount(all);
  });

  test('ミーティングの議事録: 先生がテキストをアップして公開すると、学生のホームに出る。置き換え・削除ができる。他のチームには出ない', async ({ browser }) => {
    const t = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await login(t, 'teacher@trident.ac.jp');
    await t.goto('/teacher/team/A');
    await t.getByRole('button', { name: 'ミーティング記録' }).click();

    // テキストファイル (Shift_JIS ではなく UTF-8) を選ぶと、本文と日付が入る
    await t.getByLabel('議事録のファイル').setInputFiles({ name: 'A_2026-11-04.txt', mimeType: 'text/plain', buffer: Buffer.from('\uFEFF決まったこと\r\n・画面を先に作る\r\n\r\n\r\n\r\n次の1週間\r\n・検索は後回し', 'utf8') });
    await expect(t.getByLabel('議事録の本文')).toHaveValue(/画面を先に作る/);
    await expect(t.getByLabel('議事録の日付')).toHaveValue('2026-11-04');
    await t.getByRole('button', { name: '公開', exact: true }).click();
    await expect(t.getByText(/の議事録を公開しました/)).toBeVisible();

    const s = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await login(s, 'a1@trident.ac.jp');
    const card = s.getByRole('region', { name: '前回のミーティングの議事録' });
    await expect(card).toContainText('画面を先に作る');
    await expect(card).toContainText('検索は後回し');

    const o = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await login(o, 'b1@trident.ac.jp');
    await expect(o.getByText('画面を先に作る')).toHaveCount(0);

    // 置き換え
    await t.getByLabel('議事録の日付').fill('2026-11-04');
    await t.getByLabel('議事録の本文').fill('置き換えた議事録');
    t.once('dialog', (d) => d.accept());
    await t.getByRole('button', { name: '置き換えて公開' }).click();
    await s.reload();
    await expect(s.getByRole('region', { name: '前回のミーティングの議事録' })).toContainText('置き換えた議事録');

    // 空は公開できない
    await t.getByLabel('議事録の本文').fill('   ');
    await expect(t.getByRole('button', { name: /公開/ }).first()).toBeDisabled();

    // 削除
    t.once('dialog', (d) => d.accept());
    await t.locator('details > summary').filter({ hasText: '置き換えた議事録' }).click();
    await t.getByRole('button', { name: '公開をやめる(削除)' }).click();
    await s.reload();
    await expect(s.getByRole('region', { name: '前回のミーティングの議事録' })).toHaveCount(0);
  });
});

test.describe.serial('キックオフ直後の初期WBSの見直し', () => {
  test('学生のホームに案内が出る。担当のない項目がある間は「終えた」を押せない。ほかの画面にも案内が出る', async ({ browser }) => {
    const s = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await login(s, 'a1@trident.ac.jp');
    const card = s.getByRole('region', { name: '初期WBSの見直し' });
    await expect(card).toBeVisible();
    await expect(card.getByRole('button', { name: '見直しを終えた' })).toBeDisabled();
    await s.screenshot({ path: 'e2e-shots/student-home-review.png' });
    await s.goto('/daily');
    await expect(s.getByRole('status').filter({ hasText: '初期WBS(叩き台)の見直し' })).toBeVisible();
  });

  test('教員の一覧と詳細に、未確認と出る', async ({ browser }) => {
    const t = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await login(t, 'teacher@trident.ac.jp');
    await expect(t.getByText('初期WBSの見直し: 未').first()).toBeVisible();
    await t.goto('/teacher/team/A');
    await expect(t.getByText(/まだ終えていません/)).toBeVisible();
  });

  test('WBSで「担当が決まっていない項目だけ」に絞り、担当を付けると、「終えた」を押せる。記録される', async ({ browser }) => {
    const s = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await login(s, 'a1@trident.ac.jp');
    await s.getByRole('link', { name: 'WBS・ガントチャート', exact: true }).click();
    await s.locator('.wbs-row').first().waitFor();
    await s.getByRole('button', { name: '編集モードにする' }).click();
    await s.getByLabel('担当が決まっていない項目だけ').check();
    // いちばん下の項目に、担当が付くたびに行が減る。付ける人は、自分
    for (let guard = 0; guard < 80; guard++) {
      const btn = s.locator('[aria-label^="担当を変える:"]').first();
      if ((await btn.count()) === 0) break;
      await btn.click();
      await s.locator('.chips .chip-btn').first().click();
      await s.keyboard.press('Escape');
      await s.waitForTimeout(150);
    }
    await expect(s.getByText('担当が決まっていない項目は、ありません。').first()).toBeVisible();
    await s.getByLabel('担当が決まっていない項目だけ').uncheck();
    const card = s.getByRole('region', { name: '初期WBSの見直し' });
    await card.getByLabel(/全部の項目を見て/).check();
    await card.getByRole('button', { name: '見直しを終えた' }).click();
    await expect(card).toHaveCount(0);

    const t = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await login(t, 'teacher@trident.ac.jp');
    await t.goto('/teacher/team/A');
    await expect(t.getByText(/終えました/)).toBeVisible();
    await t.getByRole('button', { name: 'もう一度見直してもらう' }).click();
    await expect(t.getByText(/まだ終えていません/)).toBeVisible();
    await expect(s.getByRole('region', { name: '初期WBSの見直し' })).toBeVisible();
  });
});

test('教員のメニュー「PJ分析」: チームを選ぶと、学生と同じPJ分析と報告書 (Excel・PDF) が出る', async ({ page }) => {
  await login(page, 'teacher@trident.ac.jp');
  await page.getByRole('navigation').getByRole('link', { name: 'PJ分析', exact: true }).click();
  await expect(page.getByText('チームを選ぶと、そのチームのPJ分析')).toBeVisible();
  await page.getByRole('button', { name: /^A チーム|^Aチーム/ }).click();
  await expect(page).toHaveURL(/\/teacher\/report\/A$/);
  await expect(page.getByRole('button', { name: 'Excelで保存(.xlsx)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'PDFで保存(印刷)' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Aチーム プロジェクト概況レポート' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'ミーティング画面' })).toBeVisible();
  // 一覧からも行ける
  await page.goto('/teacher');
  await page.locator('tbody a[href^="/teacher/report/"]').first().click();
  await expect(page).toHaveURL(/\/teacher\/report\/[A-H]$/);
});

test('PJ分析: 報告書に載せる文章を書いて保存でき、提出用の報告書のプレビューに出る。チーム内の分析は出力に入らない', async ({ page }) => {
  await login(page, 'a1@trident.ac.jp');
  await page.getByRole('link', { name: 'PJ分析', exact: true }).click();
  await expect(page.getByText('「企画の概要と目的」が未記入です')).toBeVisible();
  await page.getByLabel('1. 企画の概要と目的').fill('駅の混雑を知らせるアプリを作り、通学の負担を減らす。');
  await page.getByLabel('5. 課題と対応').fill('画面設計が遅れたため、週1回の確認を増やす。');
  await page.getByRole('button', { name: '保存する' }).click();
  await expect(page.getByRole('status').filter({ hasText: '保存しました' })).toBeVisible();
  await expect(page.getByText('「企画の概要と目的」が未記入です')).toHaveCount(0);
  await page.getByText('提出用の報告書(プレビュー)').click();
  const doc = page.locator('details .company-report');
  await expect(doc.getByRole('heading', { name: '卒業研究制作 プロジェクト進捗報告書' })).toBeVisible();
  await expect(doc.getByText('駅の混雑を知らせるアプリ')).toBeVisible();
  await expect(doc.getByText('画面設計が遅れたため')).toBeVisible();
  await expect(doc.getByRole('heading', { name: '6. 今後の予定(今後4週間)' })).toBeVisible();
  await expect(doc.getByText(/担当の数に偏り|WBSにない作業/)).toHaveCount(0);
  // 印刷用の本体 (画面では隠れている) には、付録も付く
  await expect(page.locator('.print-only .company-report h2', { hasText: '付録2. WBS' })).toBeAttached();
  await page.screenshot({ path: 'e2e-shots/report-company.png', fullPage: true });
});
