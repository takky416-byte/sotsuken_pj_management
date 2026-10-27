import { describe, expect, test } from 'vitest';
import type { Task } from '../types';
import { parseOutline } from './outline';
import { planImport } from './importPlan';
import { TEMPLATE_NODES } from './template';

const mkId = () => { let n = 0; return () => `n${++n}`; };

const existingTask = (id: string, title: string, parentId: string | null, depth: 1 | 2 | 3, order = 1): Task => ({
  id, title, detail: '', parentId, depth, order, status: 'todo', assignees: [], startDate: null, endDate: null,
  links: [], source: 'user', createdBy: 'x', updatedBy: 'x', createdAt: 0, updatedAt: 0, deleted: false, deletedAt: null,
});

describe('planImport', () => {
  test('空の WBS に作る。親子の対応と order', () => {
    const { created } = planImport([], parseOutline('# A\n- a1\n  - a1x\n- a2\n# B\n- b1'), mkId());
    expect(created.map((c) => [c.title, c.depth, c.parentId])).toEqual([
      ['A', 1, null], ['a1', 2, 'n1'], ['a1x', 3, 'n2'], ['a2', 2, 'n1'], ['B', 1, null], ['b1', 2, 'n5'],
    ]);
    expect(created[0].order).toBeLessThan(created[4].order);
    expect(created[1].order).toBeLessThan(created[3].order);
  });
  test('同名の既存項目は使い回し、その下に追加する', () => {
    const existing = [existingTask('e1', 'A', null, 1), existingTask('e2', 'a1', 'e1', 2)];
    const { created, reused } = planImport(existing, parseOutline('# A\n- a1\n  - new\n- a2'), mkId());
    expect(reused).toBe(2);
    expect(created.map((c) => [c.title, c.parentId])).toEqual([['new', 'e2'], ['a2', 'e1']]);
    expect(created[1].order).toBe(1 + 1024); // a1 (order 1) の次の兄弟として末尾に追加
  });
  test('2回実行しても増えない (雛形+取り込み)', () => {
    const nodes = [...TEMPLATE_NODES, ...parseOutline('# 要件定義\n- 機能一覧を作る')];
    const first = planImport([], nodes, mkId());
    expect(first.created).toHaveLength(6);
    const asExisting = first.created.map((c) => existingTask(c.id, c.title, c.parentId, c.depth, c.order));
    expect(planImport(asExisting, nodes, mkId()).created).toEqual([]);
  });
  test('baseDepth と rootParentId: 大項目の下に貼り付ける', () => {
    const existing = [existingTask('p', '外部設計', null, 1)];
    const { created } = planImport(existing, parseOutline('x\n  y', 2), mkId(), 2, 'p');
    expect(created.map((c) => [c.title, c.depth, c.parentId])).toEqual([['x', 2, 'p'], ['y', 3, 'n1']]);
  });
  test('削除済みの同名項目は使い回さない', () => {
    const gone = { ...existingTask('e1', 'A', null, 1), deleted: true };
    expect(planImport([gone], parseOutline('# A'), mkId()).created).toHaveLength(1);
  });
});
