import { describe, expect, test } from 'vitest';
import type { Task } from '../types';
import type { Daily } from './daily';
import { attention, engagement, streakOf } from './engagement';

const task = (id: string, o: Partial<Task> = {}): Task => ({
  id, title: id, detail: '', parentId: null, depth: 1, order: 1, status: 'todo', assignees: [], startDate: null, endDate: null,
  links: [], source: 'user', createdBy: 'x', updatedBy: 'x', createdAt: 1, updatedAt: 1, deleted: false, deletedAt: null, ...o,
});
const daily = (sid: string, date: string, note = '進めた', o: Partial<Daily> = {}): Daily => ({
  id: `${date}_${sid}`, sid, date, dayKey: 0, entries: [{ kind: 'task', taskId: 't1', note }], blocker: '', absent: false, ...o,
});
const days = ['2026-10-28', '2026-10-29', '2026-11-04', '2026-11-05'].map((date) => ({ date, periods: '3-4' as const, meeting: false, note: '' }));
const base = {
  members: [{ sid: 'A1', name: '岩田' }, { sid: 'A2', name: '近内' }],
  meetings: [], thanks: [], classDays: days, today: '2026-11-05', dailyStart: '2026-10-28', windowFrom: '2026-10-15', kickoffDate: '2026-10-28',
};

describe('streakOf', () => {
  const dates = ['d1', 'd2', 'd3', 'd4'];
  const st = (a: string[]) => new Map(dates.map((d, i) => [d, a[i]] as [string, 'submitted' | 'absent' | 'missing']));
  test('連続した提出を数える。今日が未提出でも途切れない', () => {
    expect(streakOf(st(['missing', 'submitted', 'submitted', 'missing']), dates, 'd4')).toBe(2);
    expect(streakOf(st(['submitted', 'missing', 'submitted', 'submitted']), dates, 'd4')).toBe(2);
  });
  test('欠席は数えず、途切れさせない', () => {
    expect(streakOf(st(['submitted', 'absent', 'submitted', 'submitted']), dates, 'd4')).toBe(3);
  });
});

describe('engagement', () => {
  const dailies = [
    daily('A1', '2026-10-28'), daily('A1', '2026-10-29'), daily('A1', '2026-11-04'), daily('A1', '2026-11-05'),
    daily('A2', '2026-10-28'), daily('A2', '2026-10-29', '', { entries: [], absent: true }),
  ];
  const tasks = [
    task('t1', { assignees: ['A1'], status: 'done' }),
    task('t2', { assignees: ['A1'], status: 'doing', endDate: '2026-11-01' }),
    task('t3', { assignees: ['A1'], status: 'hold' }),
    task('t4', { assignees: ['A1'], deleted: true }),
  ];
  const r = engagement({ ...base, tasks, dailies });

  test('作業ログ: 提出/対象日(欠席は除く)と連続日数', () => {
    expect(r[0].daily).toEqual({ submitted: 4, days: 4, streak: 4 });
    expect(r[1].daily).toEqual({ submitted: 1, days: 2, streak: 0 }); // 10/29 欠席は対象外。11/04 が未提出なので途切れる。今日(11/05)は未提出でも数えない
  });
  test('担当: 保留と削除済みは数えない。期限超過は未完了だけ', () => {
    expect(r[0]).toMatchObject({ assigned: 2, done: 1, overdue: 1, touched: 1 });
    expect(r[1]).toMatchObject({ assigned: 0, done: 0, overdue: 0, touched: 1 });
  });
  test('作業ログを読めないときは null', () => {
    expect(engagement({ ...base, tasks, dailies: null })[0]).toMatchObject({ daily: null, touched: null, assigned: 2 });
  });
  test('約束とありがとうを数える', () => {
    const meetings = [{ id: 'm', date: 'm', decided: '', note: '', createdBy: 't', updatedAt: 1, actions: [
      { text: 'a', done: true, owner: 'A1' }, { text: 'b', done: false, owner: 'A1' }, { text: 'c', done: false, owner: null },
    ] }];
    const thanks = [{ id: '1', from: 'A1', to: 'A2', note: '', date: '2026-11-05', createdAt: 1 }];
    const x = engagement({ ...base, tasks, dailies, meetings, thanks });
    expect(x[0].promises).toEqual({ done: 1, total: 2 });
    expect(x[0].thanks).toEqual({ received: 0, sent: 1 });
    expect(x[1].thanks).toEqual({ received: 1, sent: 0 });
  });
  test('教員向けの注意: 数字だけで決めつけない目安', () => {
    expect(attention(r[1])).toContain('担当タスクがない');
    expect(attention({ ...r[1], daily: { submitted: 0, days: 3, streak: 0 } })).toContain('作業ログの提出が半分未満');
    expect(attention(r[0])).toEqual(['期限超過 1件']);
  });
});
