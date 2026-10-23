import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import type { Thank } from './engagement';
import { THANKS_PER_DAY, sendersSince, suggestThanks, thanksLeft, unseenFor } from './thanksView';

const T = '2026-11-10';
const at = (d: string) => Date.parse(`${d}T03:00:00Z`);
const task = (o: Partial<Task>): Task => ({
  id: 'x', title: 't', detail: '', parentId: null, depth: 1, order: 1, status: 'todo', assignees: [], startDate: null, endDate: null, links: [],
  source: 'user', createdBy: 'a', updatedBy: 'a', createdAt: 0, updatedAt: 0, deleted: false, deletedAt: null, ...o,
});
const th = (o: Partial<Thank>): Thank => ({ id: 'i', from: 's1', to: 's2', note: '', date: T, createdAt: 1, ...o });
const members = [{ sid: 's1', name: '甲' }, { sid: 's2', name: '乙' }, { sid: 's3', name: '丙' }];

describe('suggestThanks', () => {
  const tasks = [
    task({ id: 'a', title: '画面', status: 'done', updatedBy: 's2', updatedAt: at('2026-11-09') }),
    task({ id: 'b', title: '古い', status: 'done', updatedBy: 's3', updatedAt: at('2026-11-01') }),
    task({ id: 'c', title: '自分の', status: 'done', updatedBy: 's1', updatedAt: at('2026-11-10') }),
    task({ id: 'd', title: 'メール', source: 'adhoc', status: 'doing', updatedBy: 's3', updatedAt: at('2026-11-08') }),
  ];
  it('最近ほかの人が完了・追加したものだけを出す', () => {
    const s = suggestThanks(tasks, members, [], 's1', T);
    expect(s.map((x) => [x.name, x.reason])).toEqual([['乙', '「画面」を完了'], ['丙', '「メール」をWBSに追加']]);
  });
  it('今日すでに送った相手は除く', () => {
    expect(suggestThanks(tasks, members, [th({ to: 's2' })], 's1', T).map((x) => x.to)).toEqual(['s3']);
  });
});

describe('回数・新着', () => {
  it('今日あと何回か', () => {
    expect(thanksLeft([th({}), th({})], 's1', T)).toBe(THANKS_PER_DAY - 2);
    expect(thanksLeft([th({ date: '2026-11-09' })], 's1', T)).toBe(THANKS_PER_DAY);
  });
  it('見ていない自分宛てだけ', () => {
    const list = [th({ id: '1', to: 's1', createdAt: 5 }), th({ id: '2', to: 's1', createdAt: 9 }), th({ id: '3', to: 's2', createdAt: 10 })];
    expect(unseenFor(list, 's1', 5).map((x) => x.id)).toEqual(['2']);
  });
  it('送った人の集合', () => {
    expect([...sendersSince([th({ from: 's1' }), th({ from: 's2', date: '2026-11-01' })], '2026-11-02')]).toEqual(['s1']);
  });
});
