import { describe, expect, test } from 'vitest';
import type { Task } from '../types';
import { buildGantt, daysBetween, lightning, nextDates, pct, placeMilestones, progressRatio, weekTicks } from './gantt';

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

  describe('稲妻線', () => {
    const today = '2026-11-10';
    const tasks = [
      t('P', { startDate: '2026-11-01', endDate: '2026-11-20' }),
      t('on', { parentId: 'P', depth: 2, startDate: '2026-11-01', endDate: '2026-11-20', status: 'doing' }), // 予定の半分を過ぎて、進行中(50%)
      t('late', { parentId: 'P', depth: 2, startDate: '2026-11-01', endDate: '2026-11-10', status: 'todo' }), // 終わっているはずが未着手
      t('ahead', { parentId: 'P', depth: 2, startDate: '2026-11-10', endDate: '2026-11-11', status: 'doing' }), // 2日の予定の初日に、もう半分
      t('done', { parentId: 'P', depth: 2, startDate: '2026-11-01', endDate: '2026-11-05', status: 'done' }),
      t('future', { parentId: 'P', depth: 2, startDate: '2026-11-15', endDate: '2026-11-20' }),
      t('nodate', { parentId: 'P', depth: 2 }),
    ];
    const g = buildGantt(tasks, [], today);
    const pts = lightning(tasks, g, today);
    const at = (id: string) => pts.find((p) => p.row === g.rows.findIndex((r) => r.task.id === id))!;

    test('進み具合は、状態から (未着手0・進行中0.5・完了1)。親は、子の平均 (保留を除く)', () => {
      expect(progressRatio(tasks, 'on')).toBe(0.5);
      expect(progressRatio(tasks, 'done')).toBe(1);
      expect(progressRatio(tasks, 'P')).toBeCloseTo((0.5 + 0 + 0.5 + 1 + 0 + 0) / 6);
      expect(progressRatio([...tasks, t('h', { parentId: 'P', depth: 2, status: 'hold' })], 'P')).toBeCloseTo((0.5 + 0 + 0.5 + 1 + 0 + 0) / 6);
    });
    test('子が表示されている親の行には、点を打たない (子を出さないときは、親に打つ)', () => {
      expect(pts.some((p) => p.row === g.rows.findIndex((r) => r.task.id === 'P'))).toBe(false);
      expect(lightning(tasks, g, today, 1).some((p) => p.row === 0)).toBe(true);
    });
    test('遅れは今日の線より左 (負)、先行は右 (正)。期間に入っていないものは、今日の線の上', () => {
      expect(at('late').days).toBeLessThan(-8); // 10日の予定で、まだ手つかず
      expect(at('late').x).toBeLessThan(at('nodate').x);
      expect(at('ahead').days).toBeGreaterThan(0);
      expect(Math.abs(at('on').days)).toBeLessThan(1); // 20日の予定の10日目に50%なら、ほぼ予定どおり
      for (const id of ['done', 'future', 'nodate']) expect(at(id).days).toBe(0);
      expect(at('done').x).toBeCloseTo(at('nodate').x);
    });
  });
});
