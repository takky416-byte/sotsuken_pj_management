import { describe, expect, test } from 'vitest';
import type { Task } from '../types';
import { applyChanges, buildDigest, digestOverdue, sameDigest } from './digest';

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id, title: id, detail: '', parentId: null, depth: 1, order: 1, status: 'todo', assignees: [], links: [], source: 'user', createdBy: 't', updatedBy: 't',
  createdAt: 0, updatedAt: 0, deleted: false, deletedAt: null, startDate: null, endDate: null, ...over,
});
const tasks = [
  task('p', { endDate: '2026-11-10' }),
  task('a', { parentId: 'p', depth: 2, status: 'done', endDate: '2026-11-02' }),
  task('b', { parentId: 'p', depth: 2, endDate: '2026-11-03' }),
  task('c', { parentId: 'p', depth: 2, endDate: '2026-11-04', assignees: ['A1'] }),
  task('d', { parentId: 'p', depth: 2, status: 'hold', endDate: '2026-11-01' }),
  task('x', { parentId: 'p', depth: 2, deleted: true, endDate: '2026-11-01' }),
];

describe('集計メモ', () => {
  test('進捗は、いちばん下のタスクの完了/全体 (保留・削除は除く)。期限のあるものは、完了・保留を除いて並べる', () => {
    const d = buildDigest(tasks, 1);
    expect([d.done, d.total, d.n]).toEqual([1, 3, 5]);
    expect(d.due).toEqual(['2026-11-03LU', '2026-11-04LA', '2026-11-10PU']);
  });
  test('期限超過は、今日の日付と照らして数える。担当なしは、いちばん下のタスクだけ', () => {
    const d = buildDigest(tasks, 1);
    expect(digestOverdue(d, '2026-11-04')).toEqual({ overdue: 1, unassigned: 1 }); // 11/3 だけ過ぎている
    expect(digestOverdue(d, '2026-11-05')).toEqual({ overdue: 2, unassigned: 1 });
    expect(digestOverdue(d, '2026-11-11')).toEqual({ overdue: 3, unassigned: 1 }); // 親(P)は、担当なしに数えない
    expect(digestOverdue(d, '2026-11-01')).toEqual({ overdue: 0, unassigned: 0 });
  });
  test('ダッシュボードの従来の数え方と同じ (期限超過 = 削除・完了・保留でなく、終了日が今日より前)', () => {
    const today = '2026-11-05';
    const direct = tasks.filter((t) => !t.deleted && t.status !== 'done' && t.status !== 'hold' && t.endDate && t.endDate < today).length;
    expect(digestOverdue(buildDigest(tasks), today).overdue).toBe(direct);
  });
  test('変更を当てはめて作り直すと、実際に書いたあとのタスクから作ったものと同じ', () => {
    const next = applyChanges(tasks, new Map([['b', { status: 'done' as const }], ['c', { assignees: [] as string[] }]]));
    const d = buildDigest(next, 1);
    expect([d.done, d.total]).toEqual([2, 3]);
    expect(d.due).toEqual(['2026-11-04LU', '2026-11-10PU']);
  });
  test('更新時刻だけ違うメモは、同じとみなす', () => {
    expect(sameDigest(buildDigest(tasks, 1), buildDigest(tasks, 2))).toBe(true);
    expect(sameDigest(buildDigest(tasks), buildDigest(tasks.slice(1)))).toBe(false);
  });
});
