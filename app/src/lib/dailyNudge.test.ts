import { describe, expect, it } from 'vitest';
import type { ClassDay } from '../types';
import type { Daily } from './daily';
import { dayKey } from './dates';
import { nudgeMessage, nudgeOf } from './dailyNudge';

const days: ClassDay[] = ['2026-10-28', '2026-10-29', '2026-11-04', '2026-11-05', '2026-11-11', '2026-11-12'].map((date) => ({ date, periods: '3-4', meeting: false, note: '' }));
const daily = (date: string, o: Partial<Daily> = {}): Daily => ({ id: `${date}_A1`, sid: 'A1', date, dayKey: dayKey(date), blocker: '', absent: false,
  entries: [{ kind: 'study', note: '調べた内容を書いた' }], submittedAt: Date.parse(`${date}T07:00:00Z`), ...o } as Daily);
const run = (mine: Daily[], today: string) => nudgeOf(mine, 'A1', today, days, '2026-10-28', '2026-10-01');

describe('nudgeOf', () => {
  it('出ていれば出さない。1回ぶんの欠けなら、まだ出さない', () => {
    expect(run([daily('2026-10-28'), daily('2026-10-29'), daily('2026-11-04')], '2026-11-05').level).toBe(0);
  });
  it('授業日2回ぶん出ていなければ level 1、4回ぶんなら level 2', () => {
    const a = run([daily('2026-10-28')], '2026-11-05'); // 10/29, 11/04 が未提出
    expect(a).toMatchObject({ level: 1, missed: 2, prevDate: '2026-10-28', daysSince: 8 });
    expect(run([daily('2026-10-28')], '2026-11-12')).toMatchObject({ level: 2, missed: 4 });
  });
  it('欠席の日は数えない。今日すでに出していれば出さない', () => {
    expect(run([daily('2026-10-28'), daily('2026-10-29', { absent: true, entries: [] })], '2026-11-05').level).toBe(0);
    expect(run([daily('2026-10-28'), daily('2026-11-12')], '2026-11-12').level).toBe(0);
  });
  it('1度も出していなくても、運用開始のあとの授業日で数える', () => {
    expect(run([], '2026-11-05')).toMatchObject({ level: 1, missed: 3, prevDate: null, daysSince: null });
    expect(run([], '2026-11-12')).toMatchObject({ level: 2, missed: 5 });
  });
});

describe('nudgeMessage', () => {
  it('やさしい文言。授業日かどうかで言い方が変わる', () => {
    const m1 = nudgeMessage({ level: 1, daysSince: 8, missed: 2, prevDate: '2026-10-28' }, false)!;
    expect(m1.body).toContain('次の授業日に');
    expect(m1.body).not.toMatch(/警告|必ず|しなければ/);
    expect(nudgeMessage({ level: 2, daysSince: 15, missed: 4, prevDate: '2026-10-28' }, true)!.body).toContain('チームのメンバーに相談');
    expect(nudgeMessage({ level: 0, daysSince: null, missed: 0, prevDate: null }, true)).toBeNull();
  });
});

describe('トーンごとの文言', () => {
  const n = { level: 2 as const, daysSince: 15, missed: 4, prevDate: '2026-10-28' };
  it('シンプルは短く、カジュアルはやわらかく。どれも強い言葉は使わない', () => {
    for (const tone of ['standard', 'casual', 'simple'] as const) {
      const m = nudgeMessage(n, true, tone)!;
      expect(m.body, tone).not.toMatch(/警告|必ず|しなければ/);
      expect(m.body.length).toBeGreaterThan(10);
    }
    expect(nudgeMessage(n, true, 'simple')!.body.length).toBeLessThan(nudgeMessage(n, true, 'casual')!.body.length);
    expect(nudgeMessage(n, true, 'casual')!.title).toContain('そろそろ');
  });
});
