import { describe, expect, test } from 'vitest';
import type { Task } from '../types';
import type { Daily } from './daily';
import {
  candidateTasks, initialItems, itemsToEntries, nextCandidates, statusChanges,
} from './dailyDraft';

const TODAY = '2026-11-10';
const NOW = Date.parse('2026-11-10T03:00:00Z');
const T = (id: string, o: Partial<Task> = {}): Task => ({
  id, title: id, detail: '', parentId: null, depth: 1, order: 1, status: 'todo', assignees: ['A1'], startDate: null, endDate: null,
  links: [], source: 'user', createdBy: 'x', updatedBy: 'x', createdAt: 1, updatedAt: 1, deleted: false, deletedAt: null, ...o,
});
const tasks = [
  T('later', { startDate: '2026-11-20', endDate: '2026-11-30', order: 4 }),
  T('doing', { status: 'doing', order: 3 }),
  T('overdue', { endDate: '2026-11-05', order: 5 }),
  T('inperiod', { startDate: '2026-11-08', endDate: '2026-11-15', order: 2 }),
  T('done', { status: 'done' }),
  T('hold', { status: 'hold' }),
  T('other', { assignees: ['A2'] }),
  T('P'), T('kid', { parentId: 'P', depth: 2, assignees: ['A1'], order: 9 }),
];

describe('candidateTasks', () => {
  test('自分が担当の、子のないタスク。完了・保留は除く。急ぎのものから', () => {
    expect(candidateTasks(tasks, 'A1', TODAY).map((t) => t.id)).toEqual(['overdue', 'doing', 'inperiod', 'later', 'kid']);
  });
});

describe('initialItems', () => {
  test('日報がまだなければ、今日自分が更新したタスクを、先に入れる (完了していれば「完了した」)', () => {
    const ts = [...tasks.filter((t) => t.id !== 'doing'), T('doing', { status: 'doing', updatedBy: 'A1', updatedAt: NOW }), T('fin', { status: 'done', updatedBy: 'A1', updatedAt: NOW })];
    const items = initialItems(undefined, ts, 'A1', TODAY);
    expect(items.find((i) => i.id === 'doing')).toMatchObject({ result: 'progress', note: '' });
    expect(items.find((i) => i.id === 'fin')).toMatchObject({ result: 'done' });
    expect(items.find((i) => i.id === 'overdue')).toMatchObject({ result: null });
    expect(itemsToEntries(items).map((e) => e.taskId).sort()).toEqual(['doing', 'fin']);
  });
  test('日報があれば、その内容。結果のない古い日報は「進んだ」。候補は、結果なしで並べる', () => {
    const prev = { id: 'x', sid: 'A1', date: TODAY, dayKey: 0, blocker: '', absent: false, entries: [
      { kind: 'task', taskId: 'inperiod', note: 'ここまで進めた' }, { kind: 'study', note: '資料を読んだ' },
    ] } as Daily;
    const items = initialItems(prev, tasks, 'A1', TODAY);
    expect(items.find((i) => i.id === 'inperiod')).toMatchObject({ result: 'progress', note: 'ここまで進めた' });
    expect(items.find((i) => i.id === 'kind:study')).toMatchObject({ note: '資料を読んだ' });
    expect(items.find((i) => i.id === 'doing')).toMatchObject({ result: null });
    expect(itemsToEntries(items)).toEqual([
      { kind: 'task', taskId: 'inperiod', note: 'ここまで進めた', result: 'progress' }, { kind: 'study', note: '資料を読んだ' },
    ]);
  });
});

describe('nextCandidates / statusChanges', () => {
  test('今日完了にしたものは、次の候補から外す', () => {
    const items = initialItems(undefined, tasks, 'A1', TODAY).map((i) => (i.id === 'overdue' ? { ...i, result: 'done' as const } : i));
    expect(nextCandidates(tasks, 'A1', TODAY, items, 2).map((t) => t.id)).toEqual(['doing', 'inperiod']);
  });
  test('完了した → 完了、進んだ/詰まった → 未着手なら進行中。すでに進行中・完了なら変えない', () => {
    const items = [
      { id: 'overdue', kind: 'task' as const, taskId: 'overdue', result: 'done' as const, note: 'x' },
      { id: 'inperiod', kind: 'task' as const, taskId: 'inperiod', result: 'progress' as const, note: 'x' },
      { id: 'doing', kind: 'task' as const, taskId: 'doing', result: 'stuck' as const, note: 'x' },
      { id: 'later', kind: 'task' as const, taskId: 'later', result: null, note: '' },
    ];
    expect(statusChanges(items, tasks)).toEqual([{ taskId: 'overdue', status: 'done' }, { taskId: 'inperiod', status: 'doing' }]);
  });
});
