import { describe, expect, test } from 'vitest';
import type { Task } from '../types';
import type { Daily } from './daily';
import { undecidedNudge } from './undecided';

const T = (id: string, o: Partial<Task> = {}): Task => ({
  id, title: id, detail: '', parentId: null, depth: 1, order: 1, status: 'todo', assignees: [], startDate: null, endDate: null,
  links: [], source: 'user', createdBy: 'x', updatedBy: 'x', createdAt: 1, updatedAt: 1, deleted: false, deletedAt: null, ...o,
});
const D = (date: string, o: Partial<Daily> = {}): Daily => ({ id: `${date}_A1`, sid: 'A1', date, dayKey: 1, entries: [], blocker: '', absent: false, noWork: true, ...o } as Daily);
const TODAY = '2026-11-12';

describe('次にやることが未定だったあと', () => {
  test('前回が未定で、担当のタスクがなければ、確認を促す', () => {
    expect(undecidedNudge([D('2026-11-05', { nextUndecided: true })], [T('a', { assignees: ['A2'] })], 'A1', TODAY)).toEqual({ date: '2026-11-05' });
  });
  test('担当のタスクがあれば促さない。完了・保留・削除のタスクは数えない', () => {
    expect(undecidedNudge([D('2026-11-05', { nextUndecided: true })], [T('a', { assignees: ['A1'] })], 'A1', TODAY)).toBeNull();
    expect(undecidedNudge([D('2026-11-05', { nextUndecided: true })], [T('a', { assignees: ['A1'], status: 'done' }), T('b', { assignees: ['A1'], status: 'hold' }), T('c', { assignees: ['A1'], deleted: true })], 'A1', TODAY)).toEqual({ date: '2026-11-05' });
  });
  test('前回が未定でなければ、促さない。今日の作業ログを出したあとも促さない', () => {
    expect(undecidedNudge([D('2026-11-05')], [], 'A1', TODAY)).toBeNull();
    expect(undecidedNudge([D('2026-11-05', { nextUndecided: true }), D(TODAY, { next: 'x' })], [], 'A1', TODAY)).toBeNull();
  });
  test('最後の提出が未定でなければ、その前の未定は引き継がない', () => {
    expect(undecidedNudge([D('2026-10-29', { nextUndecided: true }), D('2026-11-05', { noWork: false, next: 'ER図を描く', entries: [{ kind: 'task', taskId: 't', note: 'ER図の主なテーブルを3つ作った' }] })], [], 'A1', TODAY)).toBeNull();
  });
});
