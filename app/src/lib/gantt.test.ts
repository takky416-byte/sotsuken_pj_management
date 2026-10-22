import { describe, expect, test } from 'vitest';
import type { Task } from '../types';
import { buildGantt, daysBetween, nextDates, pct, placeMilestones, weekTicks } from './gantt';

const t = (id: string, o: Partial<Task> = {}): Task => ({
  id, title: id, detail: '', parentId: null, depth: 1, order: 1, status: 'todo', assignees: [],
  startDate: null, endDate: null, links: [], source: 'user', createdBy: 'x', updatedBy: 'x',
  createdAt: 1, updatedAt: 1, deleted: false, deletedAt: null, ...o,
});

describe('buildGantt', () => {
  const tasks = [
    t('P'),
    t('a', { parentId: 'P', depth: 2, startDate: '2026-11-02', endDate: '2026-11-10' }),
    t('b', { parentId: 'P', depth: 2, startDate: '2026-11-08', endDate: '2026-11-20', order: 2 }),
    t('c', { parentId: 'P', depth: 2, order: 3 }),
    t('x', { parentId: 'a', depth: 3, startDate: '2026-11-03', endDate: '2026-11-04' }),
    t('gone', { parentId: 'P', depth: 2, deleted: true, startDate: '2020-01-01', endDate: '2020-01-02' }),
  ];
  const g = buildGantt(tasks, [], '2026-11-15');

  test('親の日付は子の最小・最大から求める', () => {
    const p = g.rows.find((r) => r.task.id === 'P')!;
    expect([p.start, p.end, p.derived]).toEqual(['2026-11-02', '2026-11-20', true]);
  });
  test('削除済みは含めない。深さ3は既定では出さない', () => {
    expect(g.rows.map((r) => r.task.id)).toEqual(['P', 'a', 'b', 'c']);
    expect(buildGantt(tasks, [], '2026-11-15', 3).rows.map((r) => r.task.id)).toContain('x');
  });
  test('日付のない葉は「日付未設定」に出す', () => {
    expect(g.undated.map((x) => x.id)).toEqual(['c']);
  });
  test('期限を過ぎた未完了は overdue', () => {
    expect(g.rows.find((r) => r.task.id === 'a')!.overdue).toBe(true);
    expect(g.rows.find((r) => r.task.id === 'b')!.overdue).toBe(false);
  });
  test('範囲は今日・マイルストーンを含み、位置は0〜100%', () => {
    const g2 = buildGantt([], [{ id: 'm', title: 'm', date: '2027-02-01', teamId: null }], '2026-10-28');
    expect(g2.start <= '2026-10-28' && g2.end >= '2027-02-01').toBe(true);
    expect(pct(g2, '2020-01-01')).toBe(0);
    expect(pct(g2, '2030-01-01')).toBe(100);
    expect(daysBetween('2026-10-28', '2026-11-04')).toBe(7);
  });
  test('目盛りは月曜', () => {
    const ticks = weekTicks({ start: '2026-10-28', end: '2026-11-20' });
    expect(ticks[0]).toBe('2026-11-02');
    expect(ticks).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
  });
  test('期間が長くても目盛りは16個まで', () => {
    expect(weekTicks({ start: '2026-10-28', end: '2036-10-28' }).length).toBeLessThanOrEqual(17);
  });
  test('日付の入力: 片方だけなら同じ日にそろえ、逆転しない', () => {
    const none = { startDate: null, endDate: null };
    expect(nextDates(none, 'startDate', '2026-11-02')).toEqual({ startDate: '2026-11-02', endDate: '2026-11-02' });
    expect(nextDates(none, 'endDate', '2026-11-09')).toEqual({ startDate: '2026-11-09', endDate: '2026-11-09' });
    const cur = { startDate: '2026-11-02', endDate: '2026-11-09' };
    expect(nextDates(cur, 'endDate', '2026-11-20')).toEqual({ startDate: '2026-11-02', endDate: '2026-11-20' });
    expect(nextDates(cur, 'startDate', '2026-11-15')).toEqual({ startDate: '2026-11-15', endDate: '2026-11-15' });
    expect(nextDates(cur, 'endDate', '2026-10-30')).toEqual({ startDate: '2026-10-30', endDate: '2026-10-30' });
    expect(nextDates(cur, 'startDate', '')).toEqual({ startDate: null, endDate: '2026-11-09' });
  });
  test('マイルストーン: 近い日付は、別の段に振り分けて、文字が重ならない', () => {
    const g = { start: '2026-10-26', days: 100 };
    const ms = [
      { id: 'a', title: '企画発表', date: '2026-10-28' },
      { id: 'b', title: '企画決定', date: '2026-10-28' },
      { id: 'c', title: '機材発注シメ', date: '2026-11-01' },
      { id: 'd', title: '最終発表', date: '2027-02-01' },
    ];
    const { places, lanes } = placeMilestones(ms, g);
    const lane = (id: string) => places.find((p) => p.id === id)!.lane;
    expect(new Set([lane('a'), lane('b'), lane('c')]).size).toBe(3);
    expect(lanes).toBeGreaterThanOrEqual(3);
    expect(places.find((p) => p.id === 'd')!.align).toBe('right'); // 右端は、左に伸ばす
  });
  test('マイルストーン: 離れていれば、1段に収まる', () => {
    const g = { start: '2026-10-26', days: 100 };
    const { lanes } = placeMilestones([{ id: 'a', title: 'A', date: '2026-10-28' }, { id: 'b', title: 'B', date: '2026-12-28' }], g);
    expect(lanes).toBe(1);
  });
});
