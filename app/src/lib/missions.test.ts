import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { dailyMissions, weekStart, weeklyMissions } from './missions';

const T = '2026-11-04'; // 水曜
const task = (o: Partial<Task>): Task => ({
  id: 'x', title: 't', detail: '', parentId: null, depth: 1, order: 1, status: 'todo', assignees: [], startDate: null, endDate: null, links: [],
  source: 'user', createdBy: 'a', updatedBy: 'a', createdAt: 0, updatedAt: 0, deleted: false, deletedAt: null, ...o,
});
const at = (d: string) => Date.parse(`${d}T03:00:00Z`); // JST 12時

describe('dailyMissions', () => {
  it('担当がなければ「期間を入れる」は未達成', () => {
    const m = dailyMissions([], 's1', T, { dailySubmitted: false, isClassDay: true });
    expect(m.find((x) => x.id === 'plan')?.done).toBe(false);
  });
  it('担当タスクすべてに期間があれば達成。今日更新すれば反映ミッションも達成', () => {
    const tasks = [task({ id: 'a', assignees: ['s1'], startDate: T, endDate: T, updatedBy: 's1', updatedAt: at(T) })];
    const m = dailyMissions(tasks, 's1', T, { dailySubmitted: true, isClassDay: true });
    expect(m.map((x) => [x.id, x.done])).toEqual([['plan', true], ['update', true], ['daily', true]]);
  });
  it('授業日でなく未提出なら、日報のミッションは出さない', () => {
    expect(dailyMissions([], 's1', T, { dailySubmitted: false, isClassDay: false }).some((x) => x.id === 'daily')).toBe(false);
  });
  it('完了したタスクは、期間がなくても数えない', () => {
    const tasks = [task({ id: 'a', assignees: ['s1'], startDate: T, endDate: T }), task({ id: 'b', assignees: ['s1'], status: 'done' })];
    expect(dailyMissions(tasks, 's1', T, { dailySubmitted: false, isClassDay: true })[0].done).toBe(true);
  });
});

describe('weeklyMissions', () => {
  it('週の始まりは月曜', () => {
    expect(weekStart(T)).toBe('2026-11-02');
    expect(weekStart('2026-11-08')).toBe('2026-11-02');
  });
  it('全員の更新・期間・期限超過を判定する', () => {
    const members = [{ sid: 's1', name: '甲' }, { sid: 's2', name: '乙' }];
    const tasks = [
      task({ id: 'a', assignees: ['s1'], startDate: '2026-11-01', endDate: '2026-11-03', updatedBy: 's1', updatedAt: at('2026-11-03') }),
      task({ id: 'b', assignees: ['s2'] }),
    ];
    const m = weeklyMissions(tasks, members, T);
    expect(m.find((x) => x.id === 'everyone')?.detail).toBe('まだ: 乙');
    expect(m.find((x) => x.id === 'dated')?.detail).toBe('あと1件');
    expect(m.find((x) => x.id === 'overdue')?.done).toBe(false);
  });
  it('「WBS外の作業」に子があれば、整理のミッションが出る', () => {
    const tasks = [task({ id: 'adhoc-root' }), task({ id: 'c', parentId: 'adhoc-root', depth: 2 })];
    expect(weeklyMissions(tasks, [], T).some((x) => x.id === 'adhoc')).toBe(true);
  });
});
