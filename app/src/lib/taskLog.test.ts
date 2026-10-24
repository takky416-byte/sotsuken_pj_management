import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { describeChange, diffArray, diffTask } from './taskLog';

const t = (over: Partial<Task> = {}): Task => ({
  id: 'a', title: 'ログイン画面', detail: '', parentId: null, depth: 1, order: 1, status: 'todo', assignees: ['A1'],
  startDate: null, endDate: null, links: [], source: 'user', createdBy: 'A1', updatedBy: 'A1', createdAt: 1, updatedAt: 1, deleted: false, deletedAt: null, ...over,
});
const name = (s: string) => ({ A1: '岩田', A2: '近内' }[s] ?? s);

describe('変更履歴', () => {
  it('変わった項目だけを残す', () => {
    expect(diffTask(t(), { status: 'doing', title: 'ログイン画面' })).toEqual([{ field: 'status', from: 'todo', to: 'doing' }]);
    expect(diffTask(t(), { status: 'todo' })).toEqual([]);
  });
  it('期間・担当・詳細・場所の変更', () => {
    const d = diffTask(t(), { startDate: '2026-11-01', endDate: '2026-11-05', assignees: ['A1', 'A2'], detail: 'メモ', parentId: 'p', depth: 2 });
    expect(d.map((c) => c.field)).toEqual(['startDate', 'endDate', 'assignees', 'detail', 'move']);
    expect(d.find((c) => c.field === 'detail')).toMatchObject({ from: '0字', to: '2字' }); // 詳細の中身は、履歴に残さない
  });
  it('担当の追加・削除 (変わらないときは残さない)', () => {
    expect(diffArray(t(), 'assignees', 'add', 'A2')).toEqual([{ field: 'assignees', from: 'A1', to: 'A1,A2' }]);
    expect(diffArray(t(), 'assignees', 'add', 'A1')).toEqual([]);
    expect(diffArray(t(), 'assignees', 'remove', 'A1')).toEqual([{ field: 'assignees', from: 'A1', to: '' }]);
  });
  it('画面に出す言い方', () => {
    expect(describeChange({ field: 'status', from: 'todo', to: 'doing' }, name)).toBe('状態: 未着手 → 進行中');
    expect(describeChange({ field: 'assignees', from: 'A1', to: 'A1,A2' }, name)).toBe('担当: 岩田 → 岩田・近内');
    expect(describeChange({ field: 'assignees', from: '', to: 'A2' }, name)).toBe('担当: なし → 近内');
    expect(describeChange({ field: 'move', from: '', to: '' }, name)).toBe('場所・並び順を変更');
  });
});
