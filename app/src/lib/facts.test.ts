import { describe, expect, it } from 'vitest';
import type { ClassDay, Task } from '../types';
import type { Daily } from './daily';
import { dayKey } from './dates';
import { memberFacts } from './facts';

const T = '2026-11-12';
const at = (d: string) => Date.parse(`${d}T03:00:00Z`);
const task = (o: Partial<Task>): Task => ({
  id: 'x', title: 't', detail: '', parentId: null, depth: 1, order: 1, status: 'todo', assignees: [], startDate: null, endDate: null, links: [],
  source: 'user', createdBy: 'a', updatedBy: 'a', createdAt: 0, updatedAt: 0, deleted: false, deletedAt: null, ...o,
});
const daily = (sid: string, date: string): Daily => ({ id: `${date}_${sid}`, sid, date, dayKey: dayKey(date), entries: [{ kind: 'study', note: '調べた内容を書いた' }], blocker: '', absent: false });
const classDays: ClassDay[] = ['2026-10-29', '2026-11-05', '2026-11-12'].map((date) => ({ date, periods: '3-4', meeting: true, note: '' }));
const members = [{ sid: 's1', name: '甲' }, { sid: 's2', name: '乙' }];

describe('memberFacts', () => {
  const tasks = [
    task({ id: 'a', assignees: ['s1'], status: 'doing', updatedBy: 's1', updatedAt: at('2026-11-11'), endDate: '2026-11-20' }),
    task({ id: 'b', assignees: ['s2'], status: 'todo', updatedBy: 's2', updatedAt: at('2026-10-20'), endDate: '2026-11-01' }),
  ];
  const input = {
    members, tasks, dailies: [daily('s1', '2026-10-29'), daily('s1', '2026-11-05'), daily('s1', '2026-11-12')], meetings: [], classDays,
    today: T, dailyStart: '2026-10-28', windowFrom: '2026-10-01', kickoffDate: '2026-10-28',
  };
  const [a, b] = memberFacts(input);
  it('最後に動いた日と、7日以内の更新数', () => {
    expect(a).toMatchObject({ lastActive: '2026-11-12', idleDays: 0, updates7: 1 });
    expect(b).toMatchObject({ lastActive: '2026-10-20', idleDays: 23, updates7: 0 });
  });
  it('作業ログの提出状況と、事実の気づき', () => {
    expect(a.daily).toEqual({ submitted: 3, days: 3, missed: 0 });
    // 今日(未提出)は、まだ終わっていないので数えない
    expect(b.daily).toEqual({ submitted: 0, days: 2, missed: 2 });
    expect(a.notes).toEqual([]);
    expect(b.notes).toEqual(['23日間、WBSの更新も作業ログもありません(最後: 10/20)', '作業ログが2回、未提出です', '期限超過が1件あります']);
  });
  it('作業ログを読めないときは、作業ログの数字を出さない', () => {
    expect(memberFacts({ ...input, dailies: null })[1].daily).toBeNull();
  });
});
