import { describe, expect, test } from 'vitest';
import type { Backup } from './export';
import { parseBackup, planRestore } from './restore';

const meta = { app: 'sotsuken-pj', version: 1, exportedAt: '2026-11-01T00:00:00Z', includesTeacherNotes: true } as const;
const mk = (collections: Backup['collections']): Backup => ({ meta, collections });

const backup = mk({
  roster: [{ id: 'a@trident.ac.jp', name: '岩田', role: 'student' }],
  teams: [{ id: 'A', status: 'active' }, { id: 'B', status: 'active' }],
  'teams/A/tasks': [{ id: 't1', title: '要件定義', deleted: false }, { id: 't2', title: '設計', deleted: false }],
  'teams/B/tasks': [{ id: 't9', title: 'B のタスク', deleted: false }],
  teacherNotes: [{ id: 'n1', teamId: 'A', body: 'メモ' }, { id: 'n2', teamId: 'B', body: 'B メモ' }],
});
const current = mk({
  roster: [{ id: 'a@trident.ac.jp', name: '岩田', role: 'student' }],
  teams: [{ id: 'A', status: 'active' }, { id: 'B', status: 'active' }],
  'teams/A/tasks': [{ id: 't1', title: '要件定義', deleted: true }, { id: 't3', title: '後から足した', deleted: false }],
  'teams/B/tasks': [{ id: 't9', title: 'B のタスク', deleted: false }],
});

describe('parseBackup', () => {
  test('正しい形を受け付ける', () => { expect(parseBackup(JSON.stringify(backup)).meta.version).toBe(1); });
  test('別のファイルは理由つきで断る', () => {
    expect(() => parseBackup('x')).toThrow('JSON');
    expect(() => parseBackup('{"a":1}')).toThrow('バックアップではありません');
    expect(() => parseBackup(JSON.stringify({ meta: { ...meta, version: 2 }, collections: {} }))).toThrow('未対応');
    expect(() => parseBackup(JSON.stringify({ meta, collections: { r: [{ name: 'x' }] } }))).toThrow('id');
  });
});

describe('planRestore', () => {
  test('全体: 変更・新規・変更なし・残るものを数える', () => {
    const p = planRestore(backup, current, { teams: 'all', teacherOnly: true });
    expect(p.byCollection['teams/A/tasks']).toEqual({ new: 1, changed: 1 });
    expect(p.unchanged).toBe(4); // roster, teams x2, B のタスク
    expect(p.extra).toBe(1); // t3
    expect(p.writes.find((w) => w.id === 't1')).toMatchObject({ kind: 'changed', data: { title: '要件定義', deleted: false } });
    expect(p.writes.every((w) => !('id' in w.data))).toBe(true);
  });
  test('教員専用を含めないときは、教員メモに触れない', () => {
    const p = planRestore(backup, current, { teams: 'all', teacherOnly: false });
    expect(p.writes.some((w) => w.path === 'teacherNotes')).toBe(false);
  });
  test('チームを選ぶと、そのチームの分だけ (名簿・ほかのチームには触れない)', () => {
    const p = planRestore(backup, current, { teams: ['A'], teacherOnly: true });
    expect(p.writes.map((w) => `${w.path}/${w.id}`).sort()).toEqual(['teacherNotes/n1', 'teams/A/tasks/t1', 'teams/A/tasks/t2']);
  });
  test('同じ内容は、キーの順番が違っても変更なし', () => {
    const b = mk({ x: [{ id: '1', a: 1, b: { c: [1, 2] } }] });
    const c = mk({ x: [{ id: '1', b: { c: [1, 2] }, a: 1 }] });
    expect(planRestore(b, c, { teams: 'all', teacherOnly: true }).writes).toEqual([]);
  });
});
