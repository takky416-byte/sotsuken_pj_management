import { describe, expect, test } from 'vitest';
import type { Task } from '../types';
import type { Daily } from './daily';
import { concerns, delayedTasks, isPlaceholder, touchedByMember, unassignedTasks, untouchedTasks } from './meetingView';

const T = (id: string, over: Partial<Task> = {}): Task => ({
  id, title: id, detail: '', parentId: null, depth: 1, order: 1, status: 'todo', assignees: ['A1'],
  startDate: null, endDate: null, links: [], source: 'user', createdBy: '', updatedBy: '',
  createdAt: 0, updatedAt: 0, deleted: false, deletedAt: null, ...over,
});
const D = (sid: string, date: string, over: Partial<Daily> = {}): Daily => ({
  id: `${date}_${sid}`, sid, date, dayKey: 0, entries: [], blocker: '', absent: false, ...over,
});

describe('雛形の大項目 (空の見出し) は、一覧に出さない', () => {
  const head = (id: string, over: Partial<Task> = {}) => T(id, { title: '外部設計', createdBy: 'teacher', assignees: [], ...over });
  test('手を付けていない見出しは対象外。担当や状態が付いた・子ができた・学生が作った同名は対象', () => {
    expect(isPlaceholder([head('h')], head('h'))).toBe(true);
    expect(isPlaceholder([head('h', { status: 'doing' })], head('h', { status: 'doing' }))).toBe(false);
    expect(isPlaceholder([head('h', { assignees: ['A1'] })], head('h', { assignees: ['A1'] }))).toBe(false);
    expect(isPlaceholder([head('h', { createdBy: 'A1' })], head('h', { createdBy: 'A1' }))).toBe(false);
    expect(isPlaceholder([head('h'), T('c', { parentId: 'h', depth: 2 })], head('h'))).toBe(false);
    expect(isPlaceholder([T('x', { title: '自分たちで足した項目', createdBy: 'teacher' })], T('x', { title: '自分たちで足した項目', createdBy: 'teacher' }))).toBe(false);
  });
  test('担当なし・触れられていない・期限超過の一覧に、空の見出しは出ない', () => {
    const tasks = [head('h'), T('real', { assignees: [], status: 'doing' })];
    expect(unassignedTasks(tasks).map((x) => x.id)).toEqual(['real']);
    expect(untouchedTasks(tasks, [], '2026-11-05').map((x) => x.id)).toEqual(['real']);
    // 終了日を入れた見出しは、手を付けたものとして、期限超過の対象になる
    expect(delayedTasks([head('h', { endDate: '2026-11-01' })], '2026-11-05').map((x) => x.id)).toEqual(['h']);
  });
});

describe('meetingView', () => {
  const today = '2026-11-05';
  test('期限超過: 葉のタスクだけ。完了・保留・削除は除く', () => {
    const tasks = [
      T('late', { endDate: '2026-11-01' }), T('done', { endDate: '2026-11-01', status: 'done' }),
      T('hold', { endDate: '2026-11-01', status: 'hold' }), T('del', { endDate: '2026-11-01', deleted: true }),
      T('ok', { endDate: '2026-11-30' }),
      T('parent', { endDate: '2026-11-01' }), T('child', { parentId: 'parent', depth: 2, endDate: '2026-11-30' }),
    ];
    expect(delayedTasks(tasks, today).map((t) => t.id)).toEqual(['late']);
  });
  test('担当なし', () => {
    const tasks = [T('a', { assignees: [] }), T('b'), T('c', { assignees: [], status: 'done' })];
    expect(unassignedTasks(tasks).map((t) => t.id)).toEqual(['a']);
  });
  test('進行中や予定期間内なのに、日報で触れられていない', () => {
    const tasks = [
      T('doing', { status: 'doing' }), T('doingTouched', { status: 'doing' }),
      T('inRange', { startDate: '2026-11-01', endDate: '2026-11-10' }),
      T('future', { startDate: '2026-12-01' }), T('plain'),
    ];
    const dailies = [D('A1', '2026-11-04', { entries: [{ kind: 'task', taskId: 'doingTouched', note: '' }] })];
    expect(untouchedTasks(tasks, dailies, today).map((t) => t.id)).toEqual(['doing', 'inRange']);
  });
  test('困っていること: 新しい順。欠席・空は除く', () => {
    const out = concerns([
      D('A1', '2026-11-04', { blocker: ' 迷っている ' }), D('A2', '2026-11-05', { blocker: '詰まった' }),
      D('A3', '2026-11-05', { blocker: '  ' }), D('A1', '2026-11-03', { blocker: 'x', absent: true }),
    ]);
    expect(out).toEqual([
      { date: '2026-11-05', sid: 'A2', text: '詰まった' }, { date: '2026-11-04', sid: 'A1', text: '迷っている' },
    ]);
  });
  test('メンバーごとに触れたタスク (重複なし)', () => {
    const tasks = [T('t1', { title: '設計' }), T('t2', { title: '実装' })];
    const m = touchedByMember(tasks, [
      D('A1', '2026-11-03', { entries: [{ kind: 'task', taskId: 't1', note: '' }, { kind: 'study', note: '' }] }),
      D('A1', '2026-11-04', { entries: [{ kind: 'task', taskId: 't1', note: '' }, { kind: 'task', taskId: 't2', note: '' }] }),
      D('A2', '2026-11-04', { entries: [{ kind: 'task', taskId: 'gone', note: '' }] }),
    ]);
    expect(m.get('A1')).toEqual(['設計', '実装']);
    expect(m.has('A2')).toBe(false);
  });
});
