import { test, type Page } from '@playwright/test';
import { caption, loginAs, pause, saveVideo, tap, withCursor } from './lib';

// 操作デモ動画 (教員編)。字幕つき。音声はありません。データは manual/seed.ts (架空)。
const SIZE = { width: 1280, height: 720 };

async function recordedPage(browser: import('@playwright/test').Browser) {
  const ctx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: 'manual/out/videos-raw/tmp', size: SIZE } });
  await withCursor(ctx);
  const p0 = await ctx.newPage(); // ログインは、録画に入れない (別のページ)
  await loginAs(p0, 'teacher@trident.ac.jp');
  await p0.close();
  const page = await ctx.newPage();
  await page.goto('/teacher');
  return page;
}
const link = (page: Page, name: string) => page.locator('header nav').getByRole('link', { name, exact: true });

test('教員動画1: ダッシュボードで、要確認のチームを見つける', async ({ browser }) => {
  const page = await recordedPage(browser);
  await page.getByRole('heading', { name: 'チーム一覧' }).waitFor(); await pause(page, 2500);
  await caption(page, '1. 「チーム」が、ダッシュボードです。全チームの進み具合が、1画面で分かります'); await pause(page, 3500);
  await caption(page, '2. 「要確認」には、作業ログが2回続けて未提出の人や、担当なしで期限を過ぎたタスクが出ます'); await pause(page, 4000);
  await caption(page, '3. WBS進捗・期限超過は、タスクを変えるたびに更新される集計から出しています。合わないときは「最新にする」'); await pause(page, 4000);
  await tap(page, page.getByRole('link', { name: 'B', exact: true })); await page.getByRole('button', { name: 'WBS・ガントチャート' }).waitFor();
  await caption(page, '4. チーム名を押すと、チーム詳細です。WBS・PJ分析・関与・作業ログ・ミーティング記録・教員メモのタブがあります'); await pause(page, 3500);
  await tap(page, page.getByRole('button', { name: '関与' })); await page.waitForTimeout(1500);
  await caption(page, '5. 「関与」では、最後に動いた日・作業ログ・期限超過・約束を、事実として一覧できます'); await pause(page, 4000);
  await tap(page, page.getByRole('button', { name: '作業ログ' })); await page.waitForTimeout(1500);
  await caption(page, '6. 「作業ログ」では、授業日ごとの提出状況が分かります'); await pause(page, 3500);
  await saveVideo(page, 'demo-t-1-dashboard');
});

test('教員動画2: 利用状況で、メンバーの関与を数で見る', async ({ browser }) => {
  const page = await recordedPage(browser);
  await tap(page, link(page, '利用状況')); await page.getByRole('heading', { name: '利用状況' }).waitFor();
  await caption(page, '1. 「利用状況」は、関与・貢献の分析 / 作業ログ / アクセスの3つの見方です'); await pause(page, 3500);
  await page.getByLabel('分析するチーム').selectOption('A'); await page.waitForTimeout(2200);
  await caption(page, '2. チームと期間を選ぶと、メンバーごとの数が出ます(キックオフから通算・直近30日・直近7日)'); await pause(page, 4000);
  await page.locator('.share-bars').scrollIntoViewIfNeeded();
  await caption(page, '3. 割合の棒は、チーム全体を100%として、均等な割合の線と比べます。偏りが分かります'); await pause(page, 4500);
  await page.locator('table.heat').scrollIntoViewIfNeeded();
  await caption(page, '4. ヒートマップは、週ごとの動きです。動きが止まった週が分かります'); await pause(page, 4000);
  await caption(page, '5. 「CSVで書き出す」で、成績や面談の資料に使えます。点数や順位は、つけません'); await pause(page, 3500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await tap(page, page.getByRole('button', { name: 'チームどうし' }));
  await caption(page, '6. 「チームどうし」は、全チームを読み込んで比べます(読み取りが多いので、必要なときだけ)'); await pause(page, 3000);
  await tap(page, page.getByRole('button', { name: '全チームを読み込んで比べる' })); await page.waitForTimeout(3000);
  await caption(page, '7. メンバー1人を1つの点にして、チームの平均とばらつきを見られます。並び順はチーム名順です'); await pause(page, 4500);
  await tap(page, page.getByRole('button', { name: 'アクセス' })); await page.waitForTimeout(2200);
  await caption(page, '8. 「アクセス」は、いつ・どの画面を開いたか。名前を押すと、日ごとと全画面の合計が出ます'); await pause(page, 4000);
  await saveVideo(page, 'demo-t-2-usage');
});

test('教員動画3: キックオフで、叩き台から計画を始める', async ({ browser }) => {
  const page = await recordedPage(browser);
  await page.goto('/teacher/kickoff/E'); await page.getByRole('heading', { name: /キックオフ/ }).waitFor(); await pause(page, 1500);
  await caption(page, '1. 事前に登録した叩き台(2案)があると、企画を選ぶだけで、企画名と叩き台が入ります'); await pause(page, 3500);
  await tap(page, page.getByLabel(/企画②/));
  await caption(page, '2. 企画①・②のどちらを採用するか選びます。採用しなかった企画も、名前は残ります'); await pause(page, 3500);
  await page.getByLabel('叩き台の点検').scrollIntoViewIfNeeded();
  await caption(page, '3. 叩き台の点検: 項目数・日程・必要な成果物などを、自動でチェックします(目安です)'); await pause(page, 4500);
  await caption(page, '4. 「キックオフする」で、タスクが作られます。学生のホームに「初期WBSの見直し」が出ます'); await pause(page, 2500);
  await tap(page, page.getByRole('button', { name: 'キックオフする' })); await page.locator('.ok').first().waitFor({ timeout: 20000 }).catch(() => undefined); await pause(page, 3500);
  await saveVideo(page, 'demo-t-3-kickoff');
});

test('教員動画4: ミーティングと欠席', async ({ browser }) => {
  const page = await recordedPage(browser);
  await tap(page, link(page, 'ミーティング')); await page.waitForTimeout(1500);
  await caption(page, '1. 「ミーティング」は、1チーム10分を4つの段階で進めます'); await pause(page, 3000);
  await page.goto('/meeting/A'); await page.getByRole('heading', { name: '進捗確認会議の進め方' }).waitFor(); await pause(page, 1500);
  await caption(page, '2. 前回の約束 → 事実の確認 → 詰まり・手待ちの解消 → 決める の順に、画面を進めます'); await pause(page, 4500);
  await tap(page, link(page, '欠席')); await page.waitForTimeout(1500);
  await caption(page, '3. 「欠席」は、教員だけが入力します。欠席の日は、未提出に数えません'); await pause(page, 4000);
  await saveVideo(page, 'demo-t-4-meeting');
});

test('教員動画5: 設定(カレンダー・叩き台・バックアップ)', async ({ browser }) => {
  const page = await recordedPage(browser);
  await tap(page, link(page, '設定')); await page.waitForTimeout(1500);
  await caption(page, '1. 「設定」に、基本設定・名簿・カレンダー・叩き台の登録・書き出し/バックアップがあります'); await pause(page, 3500);
  await tap(page, page.getByRole('button', { name: 'カレンダー', exact: true })); await page.waitForTimeout(1500);
  await caption(page, '2. カレンダー: 授業日・時限・ミーティングの有無・マイルストーンを直せます'); await pause(page, 3500);
  await tap(page, page.getByRole('button', { name: '叩き台の登録' })); await page.waitForTimeout(1500);
  await caption(page, '3. 叩き台の登録: チームごと2案を、まとめて貼り付けるか、ファイルで登録します'); await pause(page, 4000);
  await tap(page, page.getByRole('button', { name: '書き出し・バックアップ' })); await page.waitForTimeout(1500);
  await caption(page, '4. 書き出し・バックアップ: 全データのJSONと、CSVを保存できます。復元もここからです'); await pause(page, 4500);
  await saveVideo(page, 'demo-t-5-settings');
});
