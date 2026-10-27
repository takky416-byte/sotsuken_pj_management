import { describe, expect, test } from 'vitest';
import type { Task } from '../types';
import type { Daily } from './daily';
import {
  candidateTasks, initialItems, itemsToEntries, newAssignments, nextCandidates, sinceOf, statusChanges,
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

describe('共同の担当で、相方が完了したタスク', () => {
  const since = NOW - 3 * 86400000;
  const pair = (o: Partial<Task>) => T('pair', { status: 'done', assignees: ['A1', 'A2'], updatedBy: 'A2', ...o });
  test('前回のあとに完了していれば、自分の作業ログの候補に出る', () => {
    const items = initialItems(undefined, [pair({ updatedAt: NOW - 86400000 })], 'A1', TODAY, since);
    expect(items.map((i) => [i.id, i.result])).toEqual([['pair', null]]);
  });
  test('前回より前に完了していた/自分の担当でないなら、出ない', () => {
    expect(initialItems(undefined, [pair({ updatedAt: since - 1000 })], 'A1', TODAY, since)).toEqual([]);
    expect(initialItems(undefined, [pair({ updatedAt: NOW - 1000, assignees: ['A2'] })], 'A1', TODAY, since)).toEqual([]);
  });
  test('完了した本人の分は、重ならない', () => {
    const items = initialItems(undefined, [pair({ updatedAt: NOW - 1000, updatedBy: 'A1' })], 'A1', TODAY, since);
    expect(items).toHaveLength(1);
  });
});

describe('initialItems', () => {
  test('作業ログがまだなければ、今日自分が更新したタスクを、先に入れる (完了していれば「完了した」)', () => {
    const ts = [...tasks.filter((t) => t.id !== 'doing'), T('doing', { status: 'doing', updatedBy: 'A1', updatedAt: NOW }), T('fin', { status: 'done', updatedBy: 'A1', updatedAt: NOW })];
    const items = initialItems(undefined, ts, 'A1', TODAY);
    expect(items.find((i) => i.id === 'doing')).toMatchObject({ result: 'progress', note: '' });
    expect(items.find((i) => i.id === 'fin')).toMatchObject({ result: 'done' });
    expect(items.find((i) => i.id === 'overdue')).toMatchObject({ result: null });
    expect(itemsToEntries(items).map((e) => e.taskId).sort()).toEqual(['doing', 'fin']);
  });
  test('作業ログがあれば、その内容。結果のない古い作業ログは「進んだ」。候補は、結果なしで並べる', () => {
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

describe('前回の作業ログのあと (授業時間外の作業も含む)', () => {
  const day = (d: string) => Date.parse(`${d}T03:00:00Z`);
  const daily = (date: string, o: Partial<Daily> = {}): Daily => ({ id: `${date}_A1`, sid: 'A1', date, dayKey: 0, blocker: '', absent: false,
    entries: [{ kind: 'study', note: '調べた内容を書いた' }], submittedAt: day(date), ...o } as Daily);

  test('sinceOf: 前回の作業ログを出した時刻。なければ7日前から。今日の分と欠席は数えない', () => {
    const r = sinceOf([daily('2026-11-03'), daily('2026-11-10'), daily('2026-11-05', { absent: true, entries: [] })], 'A1', TODAY);
    expect(r).toEqual({ since: day('2026-11-03') + 60_000, prevDate: '2026-11-03' }); // 提出のあとの状態更新を、新しい作業と数えないための余裕つき
    expect(sinceOf([], 'A1', TODAY).prevDate).toBeNull();
    expect(sinceOf([], 'A1', TODAY).since).toBe(Date.parse('2026-11-03T00:00:00+09:00'));
    expect(sinceOf([daily('2026-11-03')], 'A2', TODAY).prevDate).toBeNull(); // 他の人の作業ログは見ない
  });

  test('作業ログの提出のあとに更新された (提出で完了にした) タスクは、次の作業ログで新しい作業と数えない', () => {
    const d = daily('2026-11-03');
    const { since } = sinceOf([d], 'A1', TODAY);
    const justAfter = T('fin', { status: 'done', updatedBy: 'A1', updatedAt: (d.submittedAt as number) + 2000 });
    expect(initialItems(undefined, [justAfter], 'A1', TODAY, since).find((i) => i.id === 'fin')?.result ?? null).toBeNull();
  });

  test('initialItems: 前回の作業ログのあとに自分が更新したタスクが、先に選ばれる (前日でも)', () => {
    const since = day('2026-11-03') + 60_000;
    const ts = [T('mid', { status: 'done', updatedBy: 'A1', updatedAt: day('2026-11-06') }), T('old', { updatedBy: 'A1', updatedAt: day('2026-11-02') }),
      T('other', { updatedBy: 'A2', updatedAt: day('2026-11-06') })];
    const items = initialItems(undefined, ts, 'A1', TODAY, since);
    expect(items.find((i) => i.id === 'mid')).toMatchObject({ result: 'done' });
    expect(items.find((i) => i.id === 'old')?.result ?? null).toBeNull();
    expect(items.find((i) => i.id === 'other')?.result ?? null).toBeNull();
  });
});

describe('newAssignments (作業ログに書いたら、担当に加わる)', () => {
  const item = (id: string, result: 'progress' | 'done' | 'stuck' | null) => ({ id, kind: 'task' as const, taskId: id, result, note: 'x' });
  test('自分が担当でないタスクを書いたときだけ、担当に加える。書いていない(結果なし)・自分が担当・WBSにない作業は加えない', () => {
    expect(newAssignments([item('other', null), item('later', 'done'), item('doing', null), item('nothing', 'progress')], tasks, 'A1')).toEqual([]);
    expect(newAssignments([item('other', 'progress'), item('other', 'done'), item('later', 'progress')], tasks, 'A1')).toEqual(['other']);
    expect(newAssignments([{ id: 'adhoc:1', kind: 'task' as const, result: 'progress' as const, note: 'x', adhoc: { title: 'a', parentId: null } }], tasks, 'A1')).toEqual([]);
  });
});
