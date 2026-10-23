import { describe, expect, it } from 'vitest';
import type { Milestone, Task } from '../types';
import { analyze } from './analysis';

const T = '2026-11-10';
const at = (d: string) => Date.parse(`${d}T03:00:00Z`);
const task = (o: Partial<Task>): Task => ({
  id: 'x', title: 't', detail: '', parentId: null, depth: 1, order: 1, status: 'todo', assignees: [], startDate: null, endDate: null, links: [],
  source: 'user', createdBy: 'a', updatedBy: 'a', createdAt: 0, updatedAt: 0, deleted: false, deletedAt: null, ...o,
});
const members = [{ sid: 's1', name: '甲' }, { sid: 's2', name: '乙' }];

describe('analyze', () => {
  it('進み具合と予定の差を求める', () => {
    const tasks = [
      task({ id: 'p', title: '大項目' }),
      task({ id: 'a', parentId: 'p', depth: 2, status: 'done', endDate: '2026-11-05', assignees: ['s1'] }),
      task({ id: 'b', parentId: 'p', depth: 2, status: 'todo', endDate: '2026-11-08', assignees: ['s2'] }),
      task({ id: 'c', parentId: 'p', depth: 2, status: 'todo', endDate: '2026-11-30', assignees: ['s2'] }),
      task({ id: 'd', parentId: 'p', depth: 2, status: 'hold' }),
    ];
    const r = analyze(tasks, [], members, T);
    expect([r.total, r.done, r.hold]).toEqual([4, 1, 1]);
    expect(r.progressPct).toBe(33); // 1/3
    expect(r.plannedPct).toBe(67); // 2/3 は予定では終わっているはず
    expect(r.overdue.map((t) => t.id)).toEqual(['b']);
    expect(r.phases[0]).toMatchObject({ title: '大項目', done: 1, total: 4 });
    expect(r.findings.some((f) => f.level === 'warn' && f.text.includes('遅れています'))).toBe(true);
  });

  it('担当の偏りと、期間・担当の抜けを指摘する', () => {
    const many = Array.from({ length: 6 }, (_, i) => task({ id: `m${i}`, assignees: ['s1'], endDate: '2026-12-01' }));
    const r = analyze([...many, task({ id: 'u' })], [], members, T);
    expect(r.skewed).toBe(true);
    expect(r.undated).toBe(1);
    expect(r.unassigned).toBe(1);
  });

  it('WBS外の作業の件数と、次のマイルストーンまでのペースを出す', () => {
    const tasks = [
      task({ id: 'adhoc-root', source: 'adhoc' }),
      task({ id: 'x1', parentId: 'adhoc-root', depth: 2, source: 'adhoc', status: 'done', updatedAt: at('2026-11-09') }),
      task({ id: 'y1', endDate: '2026-11-20', assignees: ['s1'] }),
    ];
    const ms: Milestone[] = [{ id: 'm', title: '中間報告', date: '2026-11-24', teamId: null }];
    const r = analyze(tasks, ms, members, T);
    expect(r.adhoc.count).toBe(1);
    expect(r.milestone).toMatchObject({ title: '中間報告', daysLeft: 14, remaining: 1 });
    expect(r.milestone?.recentPerWeek).toBe(0.5);
  });

  it('タスクがなくても落ちない', () => {
    const r = analyze([], [], [], T);
    expect(r.total).toBe(0);
    expect(r.findings).toEqual([]);
  });
});
