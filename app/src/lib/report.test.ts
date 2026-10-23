import { describe, expect, it } from 'vitest';
import type { Milestone, Task } from '../types';
import { milestonesInWeek, overlapsWeek, spanDays, weekColumns, wbsRows } from './report';

const task = (o: Partial<Task>): Task => ({
  id: 'x', title: 't', detail: '', parentId: null, depth: 1, order: 1, status: 'todo', assignees: [], startDate: null, endDate: null, links: [],
  source: 'user', createdBy: 'a', updatedBy: 'a', createdAt: 0, updatedAt: 0, deleted: false, deletedAt: null, ...o,
});

describe('wbsRows', () => {
  const tasks = [
    task({ id: 'p', title: '設計', order: 1 }),
    task({ id: 'a', title: 'ER図', parentId: 'p', depth: 2, order: 1, status: 'done', assignees: ['s1'], startDate: '2026-11-02', endDate: '2026-11-06' }),
    task({ id: 'b', title: '画面', parentId: 'p', depth: 2, order: 2, status: 'doing', assignees: ['s1', 's2'], endDate: '2026-11-13' }),
    task({ id: 'q', title: '実装', order: 2 }),
    task({ id: 'gone', title: '消した', parentId: 'p', depth: 2, order: 3, deleted: true }),
  ];
  const rows = wbsRows(tasks, (s) => ({ s1: '甲', s2: '乙' }[s] ?? s));
  it('番号・階層・担当・期間を並べる', () => {
    expect(rows.map((r) => [r.no, r.title])).toEqual([['1', '設計'], ['1.1', 'ER図'], ['1.2', '画面'], ['2', '実装']]);
    expect(rows[2].assignees).toBe('甲・乙');
    expect(rows[0]).toMatchObject({ start: '2026-11-02', end: '2026-11-13', derived: true, assignees: '' });
  });
  it('親の状態と進捗は子から決まる', () => {
    expect(rows[0]).toMatchObject({ status: 'doing', progress: 50, leaf: false });
    expect(rows[1]).toMatchObject({ progress: 100, leaf: true });
  });
});

describe('ガントの列', () => {
  const ms: Milestone[] = [{ id: 'm', title: '中間報告', date: '2026-11-25', teamId: null }];
  it('週(月曜)の列を作る', () => {
    const w = weekColumns([{ start: '2026-11-04', end: '2026-11-12' }], ms, '2026-11-10');
    expect(w[0]).toBe('2026-11-02');
    expect(w.at(-1)).toBe('2026-11-23');
  });
  it('期間と週の重なりを判定する', () => {
    expect(overlapsWeek('2026-11-04', '2026-11-12', '2026-11-02')).toBe(true);
    expect(overlapsWeek('2026-11-04', '2026-11-12', '2026-11-09')).toBe(true);
    expect(overlapsWeek('2026-11-04', '2026-11-12', '2026-11-16')).toBe(false);
    expect(overlapsWeek(null, null, '2026-11-02')).toBe(false);
    expect(milestonesInWeek(ms, '2026-11-23')).toHaveLength(1);
    expect(spanDays('2026-11-04', '2026-11-06')).toBe(3);
  });
});
