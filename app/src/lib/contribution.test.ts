import { describe, expect, test } from 'vitest';
import type { Task } from '../types';
import { contributionCsv, contributions, periodFrom, type ContributionInput } from './contribution';

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id, title: id, detail: '', parentId: null, depth: 1, order: 1, status: 'todo', assignees: [], links: [], source: 'user', createdBy: 't', updatedBy: 't',
  createdAt: 0, updatedAt: 0, deleted: false, deletedAt: null, startDate: null, endDate: null, ...over,
});
const at = (d: string) => Date.parse(`${d}T12:00:00+09:00`);
const base = (over: Partial<ContributionInput> = {}): ContributionInput => ({
  teamId: 'A', members: [{ sid: 'A1', name: '岩田' }, { sid: 'A2', name: '近内' }], from: '2026-10-28', today: '2026-11-04',
  tasks: [task('t1', { assignees: ['A1'], status: 'done' }), task('t2', { assignees: ['A1'] }), task('t3', { assignees: ['A2'], status: 'hold' })],
  taskLogs: [
    { taskId: 't1', title: 't1', by: 'A1', at: at('2026-10-30'), kind: 'update', changes: [{ field: 'status', from: 'doing', to: 'done' }] },
    { taskId: 't2', title: 't2', by: 'A1', at: at('2026-10-30'), kind: 'update', changes: [{ field: 'endDate', from: '', to: '2026-11-10' }], via: '作業ログ' },
    { taskId: 't4', title: 't4', by: 'A1', at: at('2026-11-02'), kind: 'create', changes: [] },
    { taskId: '', title: '30件まとめて追加', by: 'A1', at: at('2026-11-02'), kind: 'create', changes: [] },
    { taskId: 't1', title: 't1', by: 'A1', at: at('2026-10-01'), kind: 'update', changes: [] }, // 期間より前
    { taskId: 't2', title: 't2', by: 'A2', at: at('2026-11-03'), kind: 'delete', changes: [] },
  ],
  dailies: [],
  classDays: [{ date: '2026-10-28', periods: '3-4', meeting: false, note: '' }, { date: '2026-11-04', periods: '3-4', meeting: false, note: '' }],
  dailyStart: '2026-10-28',
  thanks: [{ id: 'x', from: 'A1', to: 'A2', note: '', date: '2026-10-31', createdAt: 0 }],
  meetings: [], access: [],
  ...over,
});

describe('メンバーごとの関与・貢献', () => {
  test('変更履歴から、直接の編集・作業ログ経由・追加・完了を数える。期間より前は数えない', () => {
    const [a1, a2] = contributions(base());
    expect(a1).toMatchObject({ wbsEdits: 3, viaDaily: 1, created: 1, completed: 1 });
    expect(a2).toMatchObject({ wbsEdits: 1, viaDaily: 0, created: 0, completed: 0 });
  });
  test('いまの担当は、保留を除いて、完了/全体', () => {
    const [a1, a2] = contributions(base());
    expect(a1.assigned).toEqual({ total: 2, done: 1 });
    expect(a2.assigned).toEqual({ total: 0, done: 0 });
  });
  test('ありがとうは、送った数・もらった数', () => {
    const [a1, a2] = contributions(base());
    expect([a1.thanksSent, a1.thanksReceived, a2.thanksSent, a2.thanksReceived]).toEqual([1, 0, 0, 1]);
  });
  test('アクセスは、読んでいなければ null。日数と表示回数を数える', () => {
    expect(contributions(base({ access: null }))[0].access).toBeNull();
    const logs = [
      { id: '1', sid: 'A1', teamId: 'A', date: '2026-10-29', firstAt: 1, lastAt: 2, visits: 1, views: 5, screens: {} },
      { id: '2', sid: 'A1', teamId: 'A', date: '2026-10-30', firstAt: 1, lastAt: 2, visits: 1, views: 7, screens: {} },
    ];
    expect(contributions(base({ access: logs }))[0].access).toEqual({ days: 2, views: 12 });
  });
  test('作業ログは、期間内の授業日のうち提出した日 (今日の未提出は、まだ数えない)', () => {
    const d = (date: string, sid: string) => ({ id: `${date}_${sid}`, date, sid, entries: [{ kind: 'task', taskId: 't1', note: 'x', result: 'done' }] } as never);
    const [a1] = contributions(base({ dailies: [d('2026-10-28', 'A1')] }));
    expect(a1.daily).toEqual({ submitted: 1, days: 1 });
  });
});

describe('期間・CSV', () => {
  test('キックオフからの通算は、キックオフ日 (なければ作業ログの開始日) から', () => {
    expect(periodFrom('kickoff', '2026-11-04', at('2026-10-28'), '2026-10-01')).toBe('2026-10-28');
    expect(periodFrom('kickoff', '2026-11-04', null, '2026-10-01')).toBe('2026-10-01');
    expect(periodFrom('d7', '2026-11-04', null, '2026-10-01')).toBe('2026-10-29');
    expect(periodFrom('d30', '2026-11-04', null, '2026-10-01')).toBe('2026-10-06');
  });
  test('CSV: 見出し・BOM・式として実行される先頭記号の無効化', () => {
    const rows = contributions(base({ members: [{ sid: 'A1', name: '=SUM(1)' }] }));
    const csv = contributionCsv(rows);
    expect(csv.startsWith('﻿チーム,学籍番号,名前')).toBe(true);
    expect(csv).toContain("'=SUM(1)");
    expect(csv.split('\r\n')).toHaveLength(3);
  });
});
