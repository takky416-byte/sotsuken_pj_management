import { describe, expect, test } from 'vitest';
import type { Contribution } from './contribution';
import { periodDays, rateOf, shares, skew, summarize, weekStart, weeklyActivity } from './compare';

const row = (sid: string, over: Partial<Contribution> = {}): Contribution => ({
  sid, name: sid, teamId: 'A', daily: { submitted: 0, days: 0, noWork: 0 }, wbsEdits: 0, viaDaily: 0, wbsDays: 0, created: 0, createdDays: 0, completed: 0,
  assigned: { total: 0, done: 0 }, overdue: 0, access: { days: 0, views: 0 }, thanksSent: 0, thanksReceived: 0, promises: { done: 0, total: 0 }, lastActive: null, ...over,
});
const at = (d: string) => Date.parse(`${d}T12:00:00+09:00`);

describe('割合と偏り', () => {
  test('総合: 各指標の割合の平均。記録のない指標は、数えない。単位の違う数を、そのまま足さない', () => {
    const rows = [row('A1', { wbsDays: 3, createdDays: 1, daily: { submitted: 4, days: 4, noWork: 0 } }), row('A2', { wbsDays: 1, createdDays: 3, daily: { submitted: 4, days: 4, noWork: 0 } })];
    const t = shares(rows, 'total'); // wbs 75/25、created 25/75、daily 50/50 (ほかは記録なし) → 平均 50/50
    expect(t.map((x) => Math.round(x.pct as number))).toEqual([50, 50]);
    const rows2 = [row('A1', { wbsDays: 9, completed: 9 }), row('A2', { wbsDays: 1, completed: 1 })];
    expect(shares(rows2, 'total').map((x) => Math.round(x.pct as number))).toEqual([90, 10]);
    expect(shares([row('A1'), row('A2')], 'total').map((x) => x.pct)).toEqual([null, null]);
  });
  test('WBSの割合は、変更した日数で数える。1日に大量に直した人(初期WBSの見直しなど)が、突出しない', () => {
    // A1: 初期WBSの見直しで、1日に50件。A2: 週に1回ずつ、5日にわたって1件。回数なら A1 が 91% だが、日数なら 1:5
    const s = shares([row('A1', { wbsEdits: 50, wbsDays: 1 }), row('A2', { wbsEdits: 5, wbsDays: 5 })], 'wbs');
    expect(Math.round(s[0].pct as number)).toBe(17);
    expect(Math.round(s[1].pct as number)).toBe(83);
  });
  test('チーム全体を100%として割る。合計0なら出さない', () => {
    const s = shares([row('A1', { wbsDays: 6 }), row('A2', { wbsDays: 2 }), row('A3', { wbsDays: 2 })], 'wbs');
    expect(s.map((x) => x.pct)).toEqual([60, 20, 20]);
    expect(shares([row('A1'), row('A2')], 'wbs').map((x) => x.pct)).toEqual([null, null]);
  });
  test('偏りは、いちばん多い人の割合。1人だけ・記録なしは null', () => {
    expect(skew([row('A1', { wbsDays: 8 }), row('A2', { wbsDays: 2 })])).toBe(80);
    expect(skew([row('A1', { wbsDays: 8 })])).toBeNull();
    expect(skew([row('A1'), row('A2')])).toBeNull();
  });
});

describe('週ごとの動き', () => {
  test('週は月曜はじまり', () => {
    expect(weekStart('2026-10-28')).toBe('2026-10-26'); // 水曜
    expect(weekStart('2026-11-01')).toBe('2026-10-26'); // 日曜
    expect(weekStart('2026-11-02')).toBe('2026-11-02'); // 月曜
  });
  test('WBSの変更・作業ログ・アクセスを、週ごとに数える。期間の外は数えない', () => {
    const w = weeklyActivity({
      members: [{ sid: 'A1', name: '岩田' }], from: '2026-10-28', today: '2026-11-05',
      taskLogs: [
        { taskId: 't', title: '', by: 'A1', at: at('2026-10-29'), kind: 'update', changes: [] },
        { taskId: 't', title: '', by: 'A1', at: at('2026-11-03'), kind: 'update', changes: [] },
        { taskId: 't', title: '', by: 'A1', at: at('2026-10-20'), kind: 'update', changes: [] },
      ],
      dailies: [{ id: 'd', date: '2026-10-28', sid: 'A1', entries: [{ kind: 'task', taskId: 't', note: 'x' }] } as never],
      access: [{ id: 'a', sid: 'A1', teamId: 'A', date: '2026-11-04', firstAt: 1, lastAt: 2, visits: 1, views: 1, screens: {} }],
    });
    expect(w.weeks).toEqual(['2026-10-26', '2026-11-02']);
    expect(w.rows[0].counts).toEqual([2, 2]);
    expect(w.max).toBe(2);
  });
  test('同じ日の WBS の変更は、何件あっても1回', () => {
    const logs = Array.from({ length: 30 }, () => ({ taskId: 't', title: '', by: 'A1', at: at('2026-10-29'), kind: 'update' as const, changes: [] }));
    const w = weeklyActivity({ members: [{ sid: 'A1', name: '岩田' }], from: '2026-10-28', today: '2026-11-05', taskLogs: logs, dailies: [], access: null });
    expect(w.rows[0].counts).toEqual([1, 0]);
  });
});

describe('チーム間の比較', () => {
  test('率はメンバーの率の平均。分母が0の人は除く', () => {
    const rows = [
      row('A1', { daily: { submitted: 2, days: 4, noWork: 0 }, assigned: { total: 4, done: 1 }, completed: 3, overdue: 1 }),
      row('A2', { daily: { submitted: 4, days: 4, noWork: 0 }, assigned: { total: 0, done: 0 }, completed: 1, access: { days: 5, views: 9 } }),
    ];
    const s = summarize('A', rows, 10);
    expect(s.daily).toBeCloseTo(0.75);
    expect(s.done).toBeCloseTo(0.25);
    expect(s.access).toBeCloseTo(0.25); // (0 + 0.5) / 2
    expect(s.completedPerMember).toBe(2);
    expect(s.overdue).toBe(1);
  });
  test('アクセスを読んでいないときは null', () => {
    expect(rateOf(row('A1', { access: null }), 'access', 10)).toBeNull();
  });
  test('期間の日数は両端を含む', () => { expect(periodDays('2026-10-28', '2026-10-28')).toBe(1); expect(periodDays('2026-10-28', '2026-11-03')).toBe(7); });
});
