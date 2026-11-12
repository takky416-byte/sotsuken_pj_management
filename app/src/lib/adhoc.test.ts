import { describe, expect, test } from 'vitest';
import type { Task } from '../types';
import { adhocParents } from './adhoc';

const T = (id: string, over: Partial<Task> = {}): Task => ({
  id, title: id, detail: '', parentId: null, depth: 1, order: 1, status: 'todo', assignees: [],
  startDate: null, endDate: null, links: [], source: 'user', createdBy: 'x', updatedBy: 'x',
  createdAt: 0, updatedAt: 0, deleted: false, deletedAt: null, ...over,
});

describe('adhocParents: WBSにない作業の「入れる場所」', () => {
  test('大項目と、子のいる中項目だけ。子のない中項目・小項目・削除済みは出さない (子を足すと、作業ログの対象から外れるため)', () => {
    const ts = [
      T('big'),
      T('mid-with-kids', { parentId: 'big', depth: 2 }),
      T('small', { parentId: 'mid-with-kids', depth: 3 }),
      T('mid-leaf', { parentId: 'big', depth: 2 }),
      T('gone', { parentId: 'big', depth: 2, deleted: true }),
    ];
    expect(adhocParents(ts).map((t) => t.id)).toEqual(['big', 'mid-with-kids']);
  });
});
