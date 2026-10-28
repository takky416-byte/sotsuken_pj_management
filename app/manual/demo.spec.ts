import { test } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { caption, loginAs, pause, saveVideo, tap, withCursor } from './lib';

// 操作デモ動画 (学生編)。字幕つき。音声はありません。
const SIZE = { width: 1280, height: 720 };

async function recordedPage(browser: import('@playwright/test').Browser, email: string, opts: { firstTime?: boolean } = {}) {
  const ctx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: 'manual/out/videos-raw/tmp', size: SIZE } });
  await withCursor(ctx);
  if (!opts.firstTime) {
    const p0 = await ctx.newPage(); // ログインは、録画に入れない (別のページ)
    await loginAs(p0, email);
    await p0.close();
  }
  const page = await ctx.newPage();
  await page.goto('/');
  return page;
}

test('動画1: 作業ログを送る', async ({ browser }) => {
  const page = await recordedPage(browser, 'a3@trident.ac.jp');
  await page.getByRole('link', { name: '作業ログを書く' }).or(page.getByRole('link', { name: 'ホーム' })).first().waitFor();
  await caption(page, '1. アプリを開くと、ホームが出ます。今日やることが分かります'); await pause(page, 3000);
  await caption(page, '2. 授業日は「作業ログを書く」を押します');
  await tap(page, page.getByRole('link', { name: '作業ログを書く' })); await pause(page, 1500);
  await caption(page, '3. やったタスクの結果を選びます(進んだ / 完了した / 詰まった)');
  const card = page.locator('.dcard', { hasText: 'イベント一覧を作る' });
  await card.waitFor(); await pause(page, 1800);
  await caption(page, '3-2. 「詳細」でタスクの内容を開けます。「×」で、手を付けなかったタスクを外せます');
  await tap(page, card.getByRole('button', { name: /の詳細/ })); await pause(page, 3000);
  await tap(page, card.getByRole('button', { name: /の詳細/ })); await pause(page, 1200);
  await caption(page, '3-3. やったタスクの結果を選びます(進んだ / 完了した / 詰まった)'); await pause(page, 1500);
  await tap(page, card.getByRole('button', { name: '進んだ' })); await pause(page, 1200);
  await caption(page, '4. 何を・どこまでやったかを、一言書きます');
  await tap(page, card.getByLabel(/の説明/));
  await card.getByLabel(/の説明/).pressSequentially('イベント一覧の画面を作り、データを5件表示できた', { delay: 70 }); await pause(page, 1200);
  await caption(page, '5. 「つぎにやること」も書きます');
  await tap(page, page.getByLabel('次にやること', { exact: true }));
  await page.getByLabel('次にやること', { exact: true }).pressSequentially('イベントの検索ボックスを作る', { delay: 70 }); await pause(page, 1200);
  await caption(page, '6. 「作業ログを送信」を押して、完了です');
  await tap(page, page.getByRole('button', { name: '作業ログを送信' }));
  await page.locator('.celebrate-msg').waitFor(); await pause(page, 3500);
  await caption(page, '同じ日のうちなら、何度でも直せます'); await pause(page, 2500);
  await saveVideo(page, 'demo-1-daily');
});

test('動画2: WBS・ガントチャートを見る・直す', async ({ browser }) => {
  const page = await recordedPage(browser, 'a2@trident.ac.jp');
  await page.getByRole('link', { name: 'WBS・ガントチャート', exact: true }).waitFor();
  await caption(page, '1. 上のメニューから「WBS・ガントチャート」を開きます');
  await tap(page, page.getByRole('link', { name: 'WBS・ガントチャート', exact: true }));
  await page.locator('.wbs-row').first().waitFor(); await pause(page, 2500);
  await caption(page, '2. 左がタスクの一覧、右が予定の期間の棒(ガントチャート)です'); await pause(page, 3000);
  await caption(page, '3. ◆はマイルストーン。赤い線は今日、オレンジの線は遅れ・先行(稲妻線)です'); await pause(page, 3500);
  await caption(page, '3-2. タスク名の右の「詳細」で、詳しい内容を開けます'); await pause(page, 3000);
  await caption(page, '4. 直すときは「編集モードにする」を押します');
  await tap(page, page.getByRole('button', { name: '編集モードにする' })); await pause(page, 2000);
  await caption(page, '5. タスクの追加は、入力欄に書いて Enter(例: テスト項目を書く @瀬戸口 〜11/20)');
  const add = page.getByPlaceholder(/タスクを追加/);
  await tap(page, add);
  await add.pressSequentially('テスト項目を書く @瀬戸口 〜11/20', { delay: 60 }); await pause(page, 800);
  await add.press('Enter'); await pause(page, 2500);
  await caption(page, '6. 終わったら「編集モードを終える」。状態は、作業ログで更新します');
  await tap(page, page.getByRole('button', { name: '編集モードを終える' })); await pause(page, 2500);
  await caption(page, '7. 「ガントチャートを大きく」で、全体を大きく見られます');
  await tap(page, page.getByRole('button', { name: /ガントチャートを大きく/ }));
  await page.locator('.gantt-row').first().waitFor(); await pause(page, 3500);
  await caption(page, '8. 「ガントチャートで編集する」にチェックを入れると、棒をドラッグして期間を変えられます'); await pause(page, 3500);
  await saveVideo(page, 'demo-2-wbs');
});

test('動画3: PJ分析とミーティング', async ({ browser }) => {
  const page = await recordedPage(browser, 'a4@trident.ac.jp');
  await page.getByRole('link', { name: 'PJ分析', exact: true }).waitFor();
  await caption(page, '1. 「PJ分析」で、チームの概況・分析・ガントチャート・WBSを見られます');
  await tap(page, page.getByRole('link', { name: 'PJ分析', exact: true }));
  await page.getByRole('link', { name: 'ミーティングを始める' }).waitFor(); await pause(page, 4000);
  await caption(page, '2. 「報告書に載せる文章」で、企業に出す報告書の文章を書けます(ふだんは閉じています)');
  await tap(page, page.locator('.report-notes summary')); await pause(page, 3500);
  await tap(page, page.locator('.report-notes summary')); await pause(page, 800);
  await caption(page, '3. 「Excelで保存」「PDFで保存(印刷)」で、報告書(概要・進捗・ガントチャート・WBS)にできます'); await pause(page, 3000);
  await caption(page, '4. 毎週のミーティングは「ミーティングを始める」から');
  await tap(page, page.getByRole('link', { name: 'ミーティングを始める' })); await pause(page, 3000);
  await caption(page, '5. 4つの段階を「次へ」で進めます(前回の約束 → 事実の確認 → 詰まり・手待ち → 決める)'); await pause(page, 2500);
  for (let i = 0; i < 3; i++) {
    const next = page.getByRole('button', { name: '次へ →' });
    if (await next.isEnabled()) { await tap(page, next); await pause(page, 2500); }
  }
  await caption(page, '1チーム10分。記録されたデータをもとに、チームで話します'); await pause(page, 2500);
  await saveVideo(page, 'demo-3-pj');
});

test('動画4: はじめて使うとき(ログイン・ガイド)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: 'manual/out/videos-raw/tmp', size: SIZE } });
  await withCursor(ctx);
  const page = await ctx.newPage();
  await page.goto('/');
  await caption(page, '1. 学校のGoogleアカウントで入ります'); await pause(page, 2500);
  await loginAs(page, 'a4@trident.ac.jp', {
    keepGuide: true,
    onNotice: async () => { await caption(page, '2. 初回は、案内を読んで「確認して始める」を押します'); await pause(page, 3500); },
  });
  const dialog = page.getByRole('dialog', { name: '利用ガイド' });
  await dialog.waitFor();
  await caption(page, '3. 「はじめてのガイド」が出ます。「次へ →」で、画面の使い方を順に見られます'); await pause(page, 3000);
  for (let i = 0; i < 2; i++) { await tap(page, dialog.getByRole('button', { name: '次へ →' })); await pause(page, 2500); }
  await caption(page, '4. 「こんなとき」では、場面からやり方を探せます');
  await tap(page, dialog.getByRole('tab', { name: 'こんなとき' })); await pause(page, 2500);
  await tap(page, dialog.getByRole('button', { name: '詰まったとき' })); await pause(page, 3000);
  await tap(page, page.getByRole('button', { name: 'ガイドを閉じる' })); await pause(page, 1000);
  await caption(page, '5. ガイドは、右上の「ガイド」からいつでも開けます'); await pause(page, 3000);
  await tap(page, page.getByRole('link', { name: '使い方', exact: true })); await page.getByRole('heading', { name: '使い方' }).waitFor();
  await caption(page, '6. 「使い方」には、まずはこの4つと、困ったときがまとまっています'); await pause(page, 4000);
  await saveVideo(page, 'demo-4-start');
});

test('動画5: 初期WBSの見直し(キックオフのあと)', async ({ browser }) => {
  const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-sotsuken' }));
  await db.doc('teams/A').update({ wbsReview: null }); // キックオフの直後の状態にする
  try {
    const page = await recordedPage(browser, 'a1@trident.ac.jp');
    await page.locator('.review-card').waitFor();
    await caption(page, '1. キックオフのあと、ホームに「最初にやること: 初期WBSの見直し」が出ます'); await pause(page, 3500);
    await caption(page, '2. 叩き台は「たとえば」の案。みんなで1項目ずつ見て、自分たちの計画として完成させます'); await pause(page, 3500);
    await caption(page, '3. 「編集モードでWBSを開く」を押します');
    await tap(page, page.getByRole('link', { name: '編集モードでWBSを開く' }));
    await page.locator('.wbs-row').first().waitFor(); await pause(page, 2500);
    await caption(page, '4. 担当が決まっていない項目だけが、表示されます'); await pause(page, 3000);
    const row = page.locator('.wbs-row', { has: page.locator('input.title-input[value="検索機能を作る"]') });
    await caption(page, '5. 「詳細」を押すと、内容を読んで、直せます');
    await tap(page, row.getByRole('button', { name: '詳細' })); await page.locator('.detail').first().waitFor(); await pause(page, 3000);
    await tap(page, row.getByRole('button', { name: '詳細' })); await pause(page, 800);
    await caption(page, '6. 行の「＋ 担当」を押して、担当を決めます');
    await tap(page, row.getByRole('button', { name: /担当を変える/ })); await pause(page, 1500);
    await tap(page, page.locator('.chip-btn', { hasText: '氷室' })); await pause(page, 2500);
    await caption(page, '7. 要らない項目は削除、足りない項目は追加、言葉や期間は修正して、計画を完成させます'); await pause(page, 3500);
    await tap(page, page.getByRole('link', { name: 'ホーム' })); await page.locator('.review-card').waitFor(); await pause(page, 1500);
    await caption(page, '8. 全部見たら、チェックを入れて「見直しを終えた」を押します');
    await tap(page, page.getByLabel(/全部の項目を見て/)); await pause(page, 1500);
    await tap(page, page.getByRole('button', { name: '見直しを終えた' })); await pause(page, 3000);
    await saveVideo(page, 'demo-5-review');
  } finally {
    await db.doc('teams/A').update({ wbsReview: { at: Date.now(), by: 'A1' } });
  }
});
