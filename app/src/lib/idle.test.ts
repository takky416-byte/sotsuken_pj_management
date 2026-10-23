import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { idleMembers } from './idle';

const T = '2026-11-10';
const task = (o: Partial<Task>): Task => ({
  id: 'x', title: 't', detail: '', parentId: null, depth: 1, order: 1, status: 'todo', assignees: [], startDate: null, endDate: null, links: [],
  source: 'user', createdBy: 'a', updatedBy: 'a', createdAt: 0, updatedAt: 0, deleted: false, deletedAt: null, ...o,
});
const members = [{ sid: 's1', name: '甲' }, { sid: 's2', name: '乙' }, { sid: 's3', name: '丙' }];

describe('idleMembers', () => {
  it('取り組めるタスクがない人が手待ち。全員が忙しければ空', () => {
    const tasks = members.map((m, i) => task({ id: `t${i}`, assignees: [m.sid], status: 'doing' }));
    expect(idleMembers(tasks, members, T)).toEqual([]);
  });
  it('担当のいないタスクを、期限の早い順に案として出す。1つは1人だけ', () => {
    const tasks = [
      task({ id: 'a', assignees: ['s1'], status: 'doing' }),
      task({ id: 'b', assignees: ['s2'], status: 'doing' }),
      task({ id: 'u1', title: '遅れ', endDate: '2026-11-05' }),
      task({ id: 'u2', title: 'あと', endDate: '2026-11-30' }),
    ];
    const r = idleMembers(tasks, members, T, 1);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ sid: 's3' });
    expect(r[0].suggestions.map((s) => s.task.id)).toEqual(['u1']);
  });
  it('抱えすぎの人の、未着手のタスクも案に出る (着手済みは出ない)', () => {
    const heavy = ['h1', 'h2', 'h3', 'h4'].map((id, i) => task({ id, assignees: ['s1'], status: i === 0 ? 'doing' : 'todo', order: i }));
    const tasks = [...heavy, task({ id: 'b', assignees: ['s2'], status: 'doing' })];
    const r = idleMembers(tasks, members, T, 5);
    const ids = r[0].suggestions.map((s) => s.task.id);
    expect(ids).toEqual(['h2', 'h3', 'h4']);
    expect(r[0].suggestions[0].reason).toContain('甲さんが4件');
  });
  it('開始日がまだ先のタスクしかない人も手待ち', () => {
    const tasks = [task({ id: 'a', assignees: ['s1'], status: 'doing' }), task({ id: 'b', assignees: ['s2'], status: 'doing' }), task({ id: 'f', assignees: ['s3'], startDate: '2026-12-01' })];
    expect(idleMembers(tasks, members, T).map((m) => m.sid)).toEqual(['s3']);
  });
});
