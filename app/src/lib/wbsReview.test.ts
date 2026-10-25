import { describe, expect, test } from 'vitest';
import type { Task } from '../types';
import { reviewState } from './wbsReview';

const T = (id: string, o: Partial<Task> = {}): Task => ({
  id, title: id, detail: '', parentId: null, depth: 1, order: 1, status: 'todo', assignees: [], startDate: null, endDate: null,
  links: [], source: 'draft', createdBy: 'x', updatedBy: 'x', createdAt: 1, updatedAt: 1, deleted: false, deletedAt: null, ...o,
});
const active = { status: 'active' as const, kickoffAt: 1, wbsReview: null };

describe('reviewState', () => {
  const tasks = [
    T('P'), T('a', { parentId: 'P', depth: 2, assignees: ['A1'], startDate: '2026-11-01', endDate: '2026-11-05' }),
    T('b', { parentId: 'P', depth: 2 }), T('c', { parentId: 'P', depth: 2, status: 'done' }), T('d', { parentId: 'P', depth: 2, deleted: true }),
    T('要件定義', { createdBy: 'teacher', source: 'user' }),
  ];
  test('担当のないタスクを数える (完了・削除・親・空の大項目は除く)', () => {
    const r = reviewState(active, tasks);
    expect(r.unassigned.map((t) => t.id)).toEqual(['b']);
    expect(r.total).toBe(2);
    expect(r.noPeriod).toBe(1);
    expect(r.drafts).toBe(4);
    expect(r.canConfirm).toBe(false);
    expect(r.needed).toBe(true);
  });
  test('全員に担当が付くと、終えられる', () => {
    const r = reviewState(active, tasks.map((t) => (t.id === 'b' ? { ...t, assignees: ['A2'] } : t)));
    expect(r.canConfirm).toBe(true);
  });
  test('対象がまったくないときは、終えられない', () => {
    expect(reviewState(active, [T('要件定義', { createdBy: 'teacher', source: 'user' })]).canConfirm).toBe(false);
  });
  test('必要なのは、キックオフ済みで、まだ記録がないときだけ', () => {
    expect(reviewState({ status: 'planning', kickoffAt: null }, tasks).needed).toBe(false);
    expect(reviewState({ ...active, wbsReview: { at: 5, by: 'A1' } }, tasks).needed).toBe(false);
  });
});
