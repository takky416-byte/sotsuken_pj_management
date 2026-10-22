import { describe, expect, test } from 'vitest';
import type { ClassDay } from '../types';
import {
  classDatesBetween, consecutiveMisses, dailyDoc, dailyId, entriesMissingNote, statusOf, type Daily, type DayStatus,
} from './daily';

const d = (over: Partial<Daily> = {}): Daily => ({
  id: 'x', sid: 'A1', date: '2026-10-28', dayKey: 20261028, entries: [], blocker: '', absent: false, ...over,
});

describe('statusOf', () => {
  test('提出・未提出・欠席', () => {
    expect(statusOf(undefined)).toBe('missing');
    expect(statusOf(d())).toBe('missing');
    expect(statusOf(d({ entries: [{ kind: 'study', note: '論文を読んだ' }] }))).toBe('submitted');
    expect(statusOf(d({ entries: [{ kind: 'study', note: '  ' }] }))).toBe('missing'); // チェックだけは数えない
    expect(statusOf(d({ entries: [{ kind: 'study', note: '' }, { kind: 'other', note: 'x' }] }))).toBe('submitted');
    expect(statusOf(d({ blocker: '  困っている ' }))).toBe('submitted');
    expect(statusOf(d({ blocker: '   ' }))).toBe('missing');
    expect(statusOf(d({ absent: true }))).toBe('absent');
  });
});

describe('entriesMissingNote', () => {
  test('一言のない項目を返す', () => {
    const e = [{ kind: 'task' as const, taskId: 't', note: '進めた' }, { kind: 'study' as const, note: ' ' }, { kind: 'other' as const, note: '' }];
    expect(entriesMissingNote(e).map((x) => x.kind)).toEqual(['study', 'other']);
    expect(entriesMissingNote([])).toEqual([]);
  });
});

describe('dailyDoc', () => {
  test('日付キーと提出日時の引き継ぎ', () => {
    const x = dailyDoc({ sid: 'A1', date: '2026-10-28', entries: [{ kind: 'task', taskId: 't1', note: 'x' }, { kind: 'study', note: '' }], blocker: '', absent: false },
      { submittedAt: 5 }, 9);
    expect(x.dayKey).toBe(20261028);
    expect(x.submittedAt).toBe(5);
    expect(x.updatedAt).toBe(9);
    expect(x.entries[1]).toEqual({ kind: 'study', note: '' });
    expect(dailyId('2026-10-28', 'A1')).toBe('2026-10-28_A1');
  });
});

describe('classDatesBetween / consecutiveMisses', () => {
  const days: ClassDay[] = ['2026-10-28', '2026-10-29', '2026-11-04', '2026-11-05'].map((date) => ({
    date, periods: '3-4', meeting: false, note: '',
  }));
  test('授業日の範囲', () => {
    expect(classDatesBetween(days, '2026-10-29', '2026-11-05')).toEqual(['2026-10-29', '2026-11-04']);
  });
  test('未提出の連続。欠席は数えず途切れさせない', () => {
    const dates = days.map((x) => x.date);
    const m = (s: DayStatus[]) => new Map(dates.map((date, i) => [date, s[i]]));
    expect(consecutiveMisses(m(['submitted', 'submitted', 'missing', 'missing']), dates)).toBe(2);
    expect(consecutiveMisses(m(['missing', 'submitted', 'missing', 'submitted']), dates)).toBe(0);
    expect(consecutiveMisses(m(['missing', 'missing', 'absent', 'missing']), dates)).toBe(3);
    expect(consecutiveMisses(new Map(), dates)).toBe(4);
    expect(consecutiveMisses(new Map(), [])).toBe(0);
  });
});
