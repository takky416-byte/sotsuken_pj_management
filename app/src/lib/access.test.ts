import { describe, expect, it } from 'vitest';
import { accessSummary, addView, emptyPending, hasPending, screenOf, type AccessLog } from './access';

const T = '2026-11-10';
const log = (o: Partial<AccessLog>): AccessLog => ({ id: 'x', sid: 's1', teamId: 'A', date: T, firstAt: 1, lastAt: 2, visits: 1, views: 3, screens: { home: 2, wbs: 1 }, ...o });

describe('screenOf', () => {
  it('パスから画面の種類', () => {
    expect(screenOf('/')).toBe('home');
    expect(screenOf('/wbs')).toBe('wbs');
    expect(screenOf('/meeting/A')).toBe('meeting');
    expect(screenOf('/teacher/x')).toBe('other');
    expect(screenOf('/other')).toBe('other');
  });
});

describe('pending', () => {
  it('表示を数える', () => {
    const p = addView(addView(emptyPending(), 'home'), 'home');
    expect(p).toEqual({ visits: 0, views: 2, screens: { home: 2 } });
    expect(hasPending(emptyPending())).toBe(false);
    expect(hasPending(p)).toBe(true);
  });
});

describe('accessSummary', () => {
  const students = [{ sid: 's2', name: '乙', teamId: 'A' }, { sid: 's1', name: '甲', teamId: 'A' }];
  const logs = [log({ date: T, lastAt: 100 }), log({ date: '2026-11-05', lastAt: 50, screens: { daily: 4 } }), log({ date: '2026-10-01', lastAt: 10 })];
  const rows = accessSummary(logs, students, T, 14);
  it('学生ごとにまとめ、記録のない人も出す', () => {
    expect(rows.map((r) => r.sid)).toEqual(['s1', 's2']);
    expect(rows[1]).toMatchObject({ lastAt: null, daysSince: null, activeDays: 0 });
  });
  it('最後のアクション・アクセスした日数・期間内の画面', () => {
    expect(rows[0]).toMatchObject({ lastDate: T, daysSince: 0, activeDays: 2 });
    expect(rows[0].dates).toHaveLength(14);
    expect(rows[0].dates.at(-1)?.log?.date).toBe(T);
    expect(rows[0].topScreens[0]).toEqual(['daily', 4]); // 期間外 (10/1) は含めない
  });
});
