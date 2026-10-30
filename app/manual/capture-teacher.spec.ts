import { test, type Page } from '@playwright/test';
import { loginAs, shot } from './lib';

// 教員編の画面写真。枠と番号は、manual/content-teacher.json の説明と対応している。
// 撮影用のデータは manual/seed.ts (A・B・C は運用中、D・E はキックオフ前。すべて架空)。
const go = async (page: Page, path: string, wait = 900) => { await page.goto(path); await page.waitForTimeout(wait); };

test('教員編の画面写真', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  // 見つからない場所には、枠を付けない (画面の変更で、撮影が止まらないように)
  type Mark = { loc: import('@playwright/test').Locator; n: number; pad?: number };
  const S = async (name: string, marks: Mark[] = [], opts: { fullPage?: boolean; maxH?: number } = {}) => {
    const found: Mark[] = [];
    for (const m of marks) if (await m.loc.count().catch(() => 0)) found.push(m);
    if (found.length < marks.length) console.log(`枠を付けられなかった場所: ${name} ${marks.length - found.length}件`);
    await shot(page, name, found, opts);
  };
  await loginAs(page, 'teacher@trident.ac.jp');
  const nav = (name: string) => page.locator('header nav').getByRole('link', { name, exact: true });

  // 1. ダッシュボード (チーム一覧)
  await go(page, '/teacher', 1800);
  await S('t01-dashboard', [
    { loc: page.getByLabel('要確認のチームを上に並べる').locator('..'), n: 1 },
    { loc: page.getByRole('button', { name: '最新にする' }), n: 2 },
    { loc: page.getByRole('row', { name: /^B / }).locator('td').nth(3), n: 3 },
    { loc: page.getByRole('row', { name: /^B / }).locator('td').nth(5), n: 4 },
  ], { maxH: 1000 });
  await page.getByText('成果物の提出先の一覧').click().catch(() => undefined);
  await page.getByText('全チームにメッセージを送る').click().catch(() => undefined);
  await page.waitForTimeout(500);
  await S('t01b-dashboard-bottom', [
    { loc: page.getByText('成果物の提出先の一覧'), n: 1 },
    { loc: page.getByText('全チームにメッセージを送る'), n: 2 },
  ], { maxH: 1300 });

  // 2. チーム詳細
  await go(page, '/teacher/team/A', 1500);
  await S('t02-team', [
    { loc: page.getByRole('button', { name: 'WBS・ガントチャート' }), n: 1 },
    { loc: page.getByRole('button', { name: '関与' }), n: 2 },
    { loc: page.getByRole('button', { name: 'ミーティング記録' }), n: 3 },
    { loc: page.getByLabel(/メッセージ\(学生のホームに出ます/), n: 4 },
  ], { maxH: 1250 });
  await page.getByRole('button', { name: '関与' }).click(); await page.waitForTimeout(900);
  await S('t03-team-board', [], { maxH: 1250 });
  await page.getByRole('button', { name: '作業ログ' }).click(); await page.waitForTimeout(900);
  await S('t04-team-daily', [{ loc: page.locator('table.matrix').first(), n: 1 }], { maxH: 1250 });
  await page.getByRole('button', { name: 'ミーティング記録' }).click(); await page.waitForTimeout(900);
  await S('t05-team-meetings', [], { maxH: 1100 });
  await page.getByRole('button', { name: /教員メモ/ }).click(); await page.waitForTimeout(900);
  await S('t06-team-notes', [], { maxH: 1000 });

  // 3. キックオフ (D チーム: 叩き台が2案ある)
  await go(page, '/teacher/kickoff/D', 1800);
  await S('t07-kickoff', [
    { loc: page.getByLabel(/企画②/), n: 1 },
    { loc: page.getByLabel('採用する企画名'), n: 2 },
    { loc: page.getByLabel('叩き台の点検'), n: 3 },
    { loc: page.getByRole('button', { name: 'キックオフする' }), n: 4 },
  ], { maxH: 1400 });

  // 4. ミーティング・欠席
  await go(page, '/meeting/A', 1800);
  await S('t08-meeting', [], { maxH: 1250 });
  await go(page, '/teacher/attendance', 1200);
  await S('t09-attendance', [{ loc: page.getByRole('button', { name: '欠席にする' }).first(), n: 1 }], { maxH: 900 });

  // 5. 利用状況
  await go(page, '/teacher/usage', 800);
  await page.getByLabel('分析するチーム').selectOption('A');
  await page.waitForTimeout(2200);
  await S('t10-usage-analysis', [
    { loc: page.getByLabel('分析するチーム'), n: 1 },
    { loc: page.getByLabel('期間'), n: 2 },
    { loc: page.getByRole('button', { name: 'CSVで書き出す' }), n: 3 },
    { loc: page.locator('.share-bars'), n: 4 },
    { loc: page.locator('table.heat'), n: 5 },
  ], { maxH: 1500 });
  await page.getByRole('button', { name: 'チームどうし' }).click();
  await page.getByRole('button', { name: '全チームを読み込んで比べる' }).click();
  await page.waitForTimeout(2800);
  await S('t11-usage-compare', [{ loc: page.locator('.dotplot').first(), n: 1 }, { loc: page.getByLabel('点で見る指標'), n: 2 }], { maxH: 1100 });
  await go(page, '/teacher/usage?tab=logs', 800);
  await page.getByLabel('チーム', { exact: true }).selectOption('A');
  await page.waitForTimeout(1800);
  await S('t12-usage-logs', [{ loc: page.getByRole('button', { name: '個人ごと' }), n: 1 }, { loc: page.getByLabel('文字で絞り込む'), n: 2 }], { maxH: 1250 });
  await go(page, '/teacher/usage?tab=access', 2200);
  await page.getByRole('button', { name: '氷室' }).first().click().catch(() => undefined);
  await page.waitForTimeout(500);
  await S('t13-usage-access', [{ loc: page.getByRole('button', { name: '氷室' }).first(), n: 1 }, { loc: page.locator('tr.quiet').first(), n: 2 }], { maxH: 1300 });

  // 6. PJ分析
  await go(page, '/teacher/report/A', 2200);
  await S('t14-report', [], { maxH: 1300 });

  // 7. 設定
  await go(page, '/teacher/settings', 1000);
  await S('t15-settings', [{ loc: page.getByRole('button', { name: '名簿' }), n: 1 }, { loc: page.getByRole('button', { name: 'カレンダー', exact: true }), n: 2 }], { maxH: 1100 });
  await go(page, '/teacher/settings?tab=roster', 1000);
  await S('t16-roster', [], { maxH: 1200 });
  await go(page, '/teacher/settings?tab=calendar', 1200);
  await S('t17-calendar', [], { maxH: 1200 });
  await go(page, '/teacher/settings?tab=drafts', 1200);
  await S('t18-drafts', [], { maxH: 1200 });
  await go(page, '/teacher/settings?tab=export', 1200);
  await S('t19-export', [], { maxH: 1300 });

  // 8. 学生の画面・使い方
  await go(page, '/teacher/preview', 1000);
  await S('t20-preview', [{ loc: page.getByLabel('学生を選ぶ'), n: 1 }], { maxH: 800 });
  await go(page, '/teacher/help', 1000);
  await S('t21-help', [], { maxH: 1100 });
  await ctx.close();
  void nav;
});
