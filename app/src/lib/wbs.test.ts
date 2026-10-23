import { describe, expect, test } from 'vitest';
import type { Task } from '../types';
import {
  appendOrder, effectiveStatuses, flatten, newlyCompletedParents, orderAfter, orderBetween, orphansOf, overallProgress, planIndent, planMove, planOutdent, planRescue, progressOf, rollupStatus,
} from './wbs';

let seq = 0;
const T = (id: string, over: Partial<Task> = {}): Task => ({
  id, title: id, detail: '', parentId: null, depth: 1, order: ++seq, status: 'todo', assignees: [],
  startDate: null, endDate: null, links: [], source: 'user', createdBy: 'x', updatedBy: 'x',
  createdAt: 0, updatedAt: 0, deleted: false, deletedAt: null, ...over,
});

const sample = (): Task[] => [
  T('a', { order: 1 }),
  T('a1', { parentId: 'a', depth: 2, order: 1, status: 'done' }),
  T('a2', { parentId: 'a', depth: 2, order: 2 }),
  T('a2x', { parentId: 'a2', depth: 3, order: 1, status: 'done' }),
  T('b', { order: 2 }),
  T('c', { order: 3, status: 'hold' }),
];

describe('flatten', () => {
  test('親→子の順で、削除済みと折りたたみを除く', () => {
    const tasks = sample();
    tasks.push(T('gone', { parentId: 'a', depth: 2, order: 9, deleted: true }));
    expect(flatten(tasks).map((r) => r.task.id)).toEqual(['a', 'a1', 'a2', 'a2x', 'b', 'c']);
    expect(flatten(tasks, new Set(['a'])).map((r) => r.task.id)).toEqual(['a', 'b', 'c']);
    expect(flatten(tasks)[0].hasChildren).toBe(true);
  });
});

describe('progress', () => {
  test('葉の完了数。保留は分母から除く', () => {
    const tasks = sample();
    expect(progressOf(tasks, 'a')).toEqual({ done: 2, total: 2 }); // a1(done), a2x(done)
    expect(progressOf(tasks, 'b')).toEqual({ done: 0, total: 1 });
    expect(progressOf(tasks, 'c')).toEqual({ done: 0, total: 0 });
    expect(overallProgress(tasks)).toEqual({ done: 2, total: 3 });
  });
});

describe('order', () => {
  test('orderBetween / appendOrder / orderAfter', () => {
    expect(orderBetween(undefined, undefined)).toBe(1024);
    expect(orderBetween(1, 3)).toBe(2);
    expect(orderBetween(5, undefined)).toBe(1029);
    expect(orderBetween(undefined, 5)).toBe(-1019);
    const tasks = sample();
    expect(appendOrder(tasks, null)).toBe(3 + 1024);
    expect(orderAfter(tasks, 'a')).toBe(1.5);
  });
});

describe('indent / outdent / move', () => {
  test('indent: 直前の兄弟の子になり、子孫の階層も下がる', () => {
    const tasks = sample();
    const p = planIndent(tasks, 'b')!;
    expect(p[0]).toMatchObject({ id: 'b', changes: { parentId: 'a', depth: 2 } });
    expect(p.map((x) => x.id)).toEqual(['b']);
  });
  test('indent: 先頭の項目、または3階層を超える場合はできない', () => {
    const tasks = sample();
    expect(planIndent(tasks, 'a')).toBeNull();
    expect(planIndent(tasks, 'a2')).toBeNull(); // a2 の下に a2x(3) があり、a1 の下へ入れると 4 階層になる
  });
  test('outdent: 親の直後の兄弟になり、子孫の階層も上がる', () => {
    const tasks = sample();
    const p = planOutdent(tasks, 'a2')!;
    expect(p[0]).toMatchObject({ id: 'a2', changes: { parentId: null, depth: 1 } });
    expect(p[1]).toEqual({ id: 'a2x', changes: { depth: 2 } });
    expect(p[0].changes.order).toBe(1.5);
    expect(planOutdent(tasks, 'a')).toBeNull();
  });
  test('move: 隣と order を入れ替える', () => {
    const tasks = sample();
    expect(planMove(tasks, 'b', -1)).toEqual([{ id: 'a', changes: { order: 2 } }, { id: 'b', changes: { order: 1 } }]);
    expect(planMove(tasks, 'a', -1)).toBeNull();
    expect(planMove(tasks, 'c', 1)).toBeNull();
  });
});

describe('迷子のタスク', () => {
  // p (削除済み) の下に、生きている c (子 d あり) と、別の生きている x。root の r は迷子ではない。
  const tasks = (): Task[] => [
    T('r', { order: 1 }),
    T('p', { order: 2, deleted: true }),
    T('c', { parentId: 'p', depth: 2, order: 1 }),
    T('d', { parentId: 'c', depth: 3, order: 1 }),
    T('x', { parentId: 'missing', depth: 2, order: 2 }),
    T('gone', { parentId: 'p', depth: 2, order: 3, deleted: true }),
  ];
  test('親が削除済み・存在しない、生きているタスクだけを返す (子孫は含まない)', () => {
    expect(orphansOf(tasks()).map((t) => t.id)).toEqual(['c', 'x']);
    expect(orphansOf(sample())).toEqual([]);
  });
  test('迷子は、親から辿れないので、画面の木には出ない', () => {
    expect(flatten(tasks()).map((r) => r.task.id)).toEqual(['r']);
  });
  test('救済: 最上位に移し、子孫の階層も上げる', () => {
    const p = planRescue(tasks(), 'c')!;
    expect(p[0]).toMatchObject({ id: 'c', changes: { parentId: null, depth: 1 } });
    expect(p[1]).toEqual({ id: 'd', changes: { depth: 2 } });
    // 救済すると、木に出る
    const moved = tasks().map((t) => { const ch = p.find((x) => x.id === t.id); return ch ? { ...t, ...ch.changes } as Task : t; });
    expect(flatten(moved).map((r) => r.task.id)).toEqual(['r', 'c', 'd']);
    expect(orphansOf(moved).map((t) => t.id)).toEqual(['x']);
    expect(planRescue(tasks(), 'gone')).toBeNull(); // 削除済みは対象外
  });
});

describe('親タスクの状態は、子から自動で決まる', () => {
  test('rollupStatus: 保留は除いて判定する', () => {
    expect(rollupStatus(['done', 'done'])).toBe('done');
    expect(rollupStatus(['todo', 'todo'])).toBe('todo');
    expect(rollupStatus(['todo', 'done'])).toBe('doing');
    expect(rollupStatus(['doing', 'todo'])).toBe('doing');
    expect(rollupStatus(['done', 'hold'])).toBe('done'); // 保留は数えない
    expect(rollupStatus(['todo', 'hold'])).toBe('todo');
    expect(rollupStatus(['hold', 'hold'])).toBe('hold');
  });

  const tasks = [
    T('P'),
    T('a', { parentId: 'P', depth: 2, status: 'done' }),
    T('b', { parentId: 'P', depth: 2, status: 'todo' }),
    T('c', { parentId: 'b', depth: 3, status: 'doing' }),
    T('gone', { parentId: 'P', depth: 2, status: 'todo', deleted: true }),
    T('solo', { status: 'doing' }),
  ];
  test('孫まで、下から順に求める。削除済みの子は数えない。子のないタスクは、自分の状態', () => {
    const m = effectiveStatuses(tasks);
    expect(m.get('b')).toBe('doing'); // 子 c が進行中
    expect(m.get('P')).toBe('doing'); // a 完了 + b 進行中
    expect(m.get('solo')).toBe('doing');
  });
  test('親の保存された状態は、無視する', () => {
    const m = effectiveStatuses(tasks.map((t) => (t.id === 'P' ? { ...t, status: 'done' as const } : t)));
    expect(m.get('P')).toBe('doing');
  });
  test('最後の子を完了にすると、親が完了になる (お祝いの判定)', () => {
    const done = [T('P'), T('a', { parentId: 'P', depth: 2, status: 'done' }), T('b', { parentId: 'P', depth: 2, status: 'doing' })];
    expect(newlyCompletedParents(done, 'b', 'done').map((t) => t.id)).toEqual(['P']);
    expect(newlyCompletedParents(done, 'b', 'todo')).toEqual([]);
  });
});
