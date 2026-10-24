import { expect, test, type Page } from '@playwright/test';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { login } from './helpers';
import { addDays, today } from './dates';

// Firestore の読み取り回数を、画面ごとに計測する (無料枠は 1 日 5 万回)。
// 運用の中盤を想定した規模: 8 チーム (28 名)、タスク 60 件/チーム、作業ログは 30 日分。
// 結果は表で出力する。回帰を防ぐため、画面を行き来したときの増え方に上限を置く。

const TEAMS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const sizes: Record<string, number> = { A: 2, B: 1, C: 4, D: 4, E: 4, F: 4, G: 4, H: 4 };

async function seedScale() {
  const db = getFirestore(getApps()[0] ?? initializeApp({ projectId: 'demo-sotsuken' }));
  const t = today();
  let writer = db.batch();
  let n = 0;
  const set = async (path: string, data: Record<string, unknown>) => {
    writer.set(db.doc(path), data);
    if (++n % 400 === 0) { await writer.commit(); writer = db.batch(); }
  };
  for (const team of TEAMS) {
    const members = Array.from({ length: sizes[team] }, (_, i) => ({ sid: `${team}${i + 1}`, name: `${team}${i + 1}さん` }));
    await set(`teams/${team}`, { members, status: 'active', projectName: `${team}の企画`, proposals: [], driveUrl: '', kickoffAt: 1, teamMeetingInput: false });
    // 既存の学生 (A1, A2, B1) 以外も、名簿に入れる (ログインはしない)
    for (const m of members) if (!['A1', 'A2', 'B1'].includes(m.sid)) await set(`roster/${m.sid.toLowerCase()}@trident.ac.jp`, { name: m.name, role: 'student', teamId: team, sid: m.sid });
    // タスク 60 件 (大項目 6 + 子 54)
    for (let i = 0; i < 60; i++) {
      const depth = i < 6 ? 1 : 2;
      await set(`teams/${team}/tasks/scale-${i}`, {
        title: `タスク${i}`, detail: '', parentId: depth === 1 ? null : `scale-${i % 6}`, depth, order: i, status: i % 3 === 0 ? 'done' : 'todo',
        assignees: [], startDate: null, endDate: null, links: [], source: 'user', createdBy: 'teacher', updatedBy: 'teacher', createdAt: 1, updatedAt: 1, deleted: false, deletedAt: null,
      });
    }
    // 作業ログ: 過去 30 日のうち、週 3 回 (13 日) × メンバー
    for (const m of members) {
      for (let d = 1; d <= 30; d++) {
        if (d % 7 > 2) continue;
        const date = addDays(t, -d);
        await set(`teams/${team}/dailyReports/${date}_${m.sid}`, { sid: m.sid, date, dayKey: 0, entries: [{ kind: 'study', note: '調べた' }], blocker: '', absent: false });
      }
    }
    // アクセス履歴: 過去 20 日のうち 15 日 × メンバー (最悪に近い規模)
    for (const m of members) {
      for (let d = 0; d < 20; d++) {
        if (d % 4 === 3) continue;
        const date = addDays(t, -d);
        await set(`accessLogs/${date}_${m.sid}`, { sid: m.sid, teamId: team, date, firstAt: 1, lastAt: 2, visits: 2, views: 20, screens: { home: 8, wbs: 6, daily: 4, gantt: 2 } });
      }
    }
    for (let k = 1; k <= 8; k++) await set(`teams/${team}/meetings/scale-${k}`, { date: addDays(t, -7 * k), decided: '決定', actions: [], note: '' });
  }
  await writer.commit();
}

const reads = (p: Page) => p.evaluate(() => (window as unknown as { __readMeter: { total: number; byLabel: Record<string, number> } }).__readMeter);
const rows: string[] = [];
async function measure(p: Page, label: string, action: () => Promise<void>) {
  const before = (await reads(p)).total;
  await action();
  await p.waitForTimeout(1500); // 購読の結果が届くのを待つ
  const after = await reads(p);
  rows.push(`${label.padEnd(34)} ${String(after.total - before).padStart(6)}`);
  return after.total - before;
}

test.describe.serial('読み取り回数', () => {
  test.beforeAll(async () => { await seedScale(); });
  test.afterAll(() => { console.log(`\n--- 読み取り回数 (1 画面あたり) ---\n${rows.join('\n')}\n`); });

  test('教員: ダッシュボード → チーム詳細 → ミーティング → ダッシュボードに戻る (再読み込みなし)', async ({ page }) => {
    await login(page, 'teacher@trident.ac.jp');
    const first = await measure(page, '教員: ダッシュボード (初回)', async () => { await page.getByRole('link', { name: 'チーム', exact: true }).click(); await page.getByRole('heading', { name: 'チーム一覧' }).waitFor(); });
    const detail = await measure(page, '教員: Cチーム詳細 (WBS)', async () => { await page.locator('tr', { has: page.getByRole('link', { name: 'C', exact: true }) }).getByRole('link').click(); await page.getByRole('button', { name: 'WBS・ガントチャート' }).waitFor(); });
    const daily = await measure(page, '教員: Cチーム 作業ログタブ', async () => { await page.getByRole('button', { name: '作業ログ' }).click(); await page.getByText('提出状況').waitFor(); });
    await measure(page, '教員: ミーティング画面 (最初のチーム)', async () => { await page.getByRole('link', { name: 'ミーティング', exact: true }).click(); await page.getByRole('heading', { name: '進捗確認会議の進め方' }).waitFor(); });
    await measure(page, '教員: 次のチームのミーティング', async () => { await page.getByRole('link', { name: /^[A-H] →$/ }).click(); await page.getByRole('heading', { name: '進捗確認会議の進め方' }).waitFor(); });
    const access = await measure(page, '教員: アクセス履歴', async () => { await page.getByRole('link', { name: 'アクセス', exact: true }).click(); await page.getByRole('heading', { name: 'アクセス履歴' }).waitFor(); });
    const back = await measure(page, '教員: ダッシュボードに戻る', async () => { await page.getByRole('link', { name: 'チーム', exact: true }).click(); await page.getByRole('heading', { name: 'チーム一覧' }).waitFor(); });
    console.log('教員 ラベル別 (合計):', JSON.stringify((await reads(page)).byLabel));
    // 上限 (回帰の防止): 初回は規模に比例する。画面を移っても、同じデータを読み直さない
    expect(first).toBeLessThan(1000);
    expect(detail).toBeLessThan(30);
    expect(daily).toBeLessThan(30);
    expect(access).toBeLessThan(450); // 28名 × 直近14日ぶんまで。開くたびではなく、5分間は共有される
    expect(back).toBeLessThan(150); // 最初のチーム以外のデータを、新しく購読する分
  });

  test('学生: ホーム → WBS → 作業ログ → ミーティング → ホーム (再読み込みなし)', async ({ page }) => {
    await login(page, 'a1@trident.ac.jp');
    const home = await measure(page, '学生: ログイン直後 (ホーム)', async () => { await page.getByRole('link', { name: 'ホーム' }).click(); await page.getByText('今日やること').waitFor(); });
    const wbs = await measure(page, '学生: WBS', async () => { await page.getByRole('link', { name: 'WBS・ガントチャート', exact: true }).click(); await page.getByRole('heading', { name: 'WBS・ガントチャート' }).waitFor(); });
    const daily = await measure(page, '学生: 作業ログ', async () => { await page.getByRole('link', { name: '作業ログ', exact: true }).click(); await page.getByRole('heading', { name: '作業ログ', exact: true }).waitFor(); });
    const meeting = await measure(page, '学生: ミーティング', async () => { await page.getByRole('link', { name: 'ミーティング' }).click(); await page.getByRole('heading', { name: '進捗確認会議の進め方' }).waitFor(); });
    const back = await measure(page, '学生: ホームに戻る', async () => { await page.getByRole('link', { name: 'ホーム' }).click(); await page.getByText('今日やること').waitFor(); });
    console.log('学生 合計:', (await reads(page)).total, 'ラベル別:', JSON.stringify((await reads(page)).byLabel));
    expect(home).toBeLessThan(150);
    expect(wbs + daily + meeting + back).toBeLessThan(60); // 画面を移るたびに、タスク全件を読み直さない
  });
});
