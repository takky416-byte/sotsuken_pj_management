import { describe, expect, test } from 'vitest';
import type { Task } from '../types';
import type { Daily } from './daily';
import type { Meeting } from './meeting';
import { dayInfo, doToday, lastNextPlan, myPromises, unassigned, upcoming } from './todayPlan';

const TODAY = '2026-11-10';
const T = (id: string, o: Partial<Task> = {}): Task => ({
  id, title: id, detail: '', parentId: null, depth: 1, order: 1, status: 'todo', assignees: ['A1'], startDate: null, endDate: null,
  links: [], source: 'user', createdBy: 'x', updatedBy: 'x', createdAt: 1, updatedAt: 1, deleted: false, deletedAt: null, ...o,
});
const tasks = [
  T('overdue', { endDate: '2026-11-05', order: 1 }),
  T('doing', { status: 'doing', order: 2 }),
  T('period', { startDate: '2026-11-08', endDate: '2026-11-15', order: 3 }),
  T('soon', { startDate: '2026-11-12', endDate: '2026-11-18', order: 4 }),
  T('far', { startDate: '2026-12-20', endDate: '2026-12-25' }),
  T('done', { status: 'done', endDate: '2026-11-01' }),
  T('hold', { status: 'hold', endDate: '2026-11-01' }),
  T('mine-not', { assignees: ['A2'], endDate: '2026-11-01' }),
  T('free1', { assignees: [], endDate: '2026-11-07' }),
  T('free2', { assignees: [], startDate: '2026-11-09' }),
  T('free3', { assignees: [], order: 9 }),
  T('free4', { assignees: [], order: 10 }),
  T('P'), T('kid', { parentId: 'P', depth: 2, status: 'doing', assignees: ['A1'], order: 7 }),
];

describe('今日やること', () => {
  test('期限超過 → 進行中 → 予定の期間内。完了・保留・他人のタスク・まだ先のものは出ない。親は出ない', () => {
    expect(doToday(tasks, 'A1', TODAY).map((p) => [p.task.id, p.reason])).toEqual([
      ['overdue', 'overdue'], ['doing', 'doing'], ['kid', 'doing'], ['period', 'period'],
    ]);
  });
});

describe('次にやること', () => {
  test('これから始まるもの (14日以内) を、始まりの近い順に', () => {
    expect(upcoming(tasks, 'A1', TODAY).map((t) => t.id)).toEqual(['soon']);
    expect(upcoming(tasks, 'A1', TODAY, 60).map((t) => t.id)).toEqual(['soon', 'far']);
  });
  test('担当がいないタスクは、期限超過 → 期間内 → ほか。3件まで', () => {
    expect(unassigned(tasks, TODAY).map((t) => t.id)).toEqual(['free1', 'free2', 'free3']);
  });
});

describe('約束', () => {
  const m = (date: string, actions: Meeting['actions']): Meeting => ({ id: date, date, decided: '', note: '', createdBy: 't', updatedAt: 1, actions });
  test('自分が約束した、終わっていないものだけ。新しい回から', () => {
    const ps = myPromises([
      m('2026-11-05', [{ text: 'a', done: false, owner: 'A1' }, { text: 'b', done: true, owner: 'A1' }, { text: 'c', done: false, owner: 'A2' }]),
      m('2026-11-12', [{ text: 'd', done: false, owner: 'A1' }, { text: 'e', done: false, owner: null }]),
    ], 'A1');
    expect(ps.map((p) => `${p.meetingId}#${p.index}:${p.action.text}`)).toEqual(['2026-11-12#0:d', '2026-11-05#0:a']);
  });
});

describe('今日の状況', () => {
  const days = [{ date: '2026-11-10', periods: '3-4' as const, meeting: false, note: '' }, { date: '2026-11-12', periods: '1-2' as const, meeting: true, note: '' }];
  const sub = { id: 'x', sid: 'A1', date: TODAY, dayKey: 0, entries: [{ kind: 'study', note: '調べた' }], blocker: '', absent: false } as Daily;
  test('授業日で未提出なら missing。提出済み・欠席・授業日でない日・運用開始前は、それぞれ', () => {
    expect(dayInfo(days, TODAY, '2026-10-28', undefined)).toMatchObject({ isClassDay: true, status: 'missing', periods: '3-4' });
    expect(dayInfo(days, TODAY, '2026-10-28', sub).status).toBe('submitted');
    expect(dayInfo(days, TODAY, '2026-10-28', { ...sub, entries: [], absent: true }).status).toBe('absent');
    expect(dayInfo(days, '2026-11-11', '2026-10-28', undefined)).toMatchObject({ isClassDay: false, status: 'free', next: days[1] });
    expect(dayInfo(days, TODAY, '2026-11-20', undefined)).toMatchObject({ started: false, status: 'free' });
  });
  test('直近の「次にやること」', () => {
    expect(lastNextPlan([{ ...sub, date: '2026-11-03', next: '古い' } as Daily, { ...sub, date: '2026-11-05', next: ' 新しい ' } as Daily, { ...sub, date: '2026-11-06' } as Daily])).toEqual({ date: '2026-11-05', text: '新しい' });
    expect(lastNextPlan([])).toBeNull();
  });
});
