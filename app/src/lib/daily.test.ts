import { describe, expect, test } from 'vitest';
import type { ClassDay } from '../types';
import {
  charCount, classDatesBetween, consecutiveMisses, dailyDoc, dailyId, entriesMissingNote, statusOf, validateDaily, type Daily, type DayStatus,
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

describe('validateDaily: 新しく提出する作業レポートは、しっかり書かせる', () => {
  const long = '設計書の画面一覧を整理して、足りない画面を3つ見つけた';
  test('取り組み・説明・次にやること がそろっていれば、問題なし', () => {
    expect(validateDaily([{ kind: 'task', taskId: 't', note: long, result: 'progress' }], '管理者画面のワイヤーフレームを描く')).toEqual([]);
  });
  test('取り組みがない', () => {
    expect(validateDaily([], '管理者画面のワイヤーフレームを描く').map((p) => p.key)).toEqual(['entries']);
  });
  test('説明が短い (空白は数えない)。もう少し具体的に、と示す', () => {
    const p = validateDaily([{ kind: 'study', note: '  調べた   ' }], '管理者画面のワイヤーフレームを描く', () => '調査');
    expect(p).toHaveLength(1);
    expect(p[0].key).toBe('note:0');
    expect(p[0].message).toContain('もう少し具体的に');
    expect(charCount(' あ い\nう ')).toBe(3);
  });
  test('次にやることが短い・ない', () => {
    expect(validateDaily([{ kind: 'study', note: long }], '').map((p) => p.key)).toEqual(['next']);
    expect(validateDaily([{ kind: 'study', note: long }], '続きをやる').map((p) => p.key)).toEqual(['next']);
  });
});

describe('dailyDoc: 結果と次にやること', () => {
  test('result と next を保存する。結果のない項目には result を付けない', () => {
    const doc = dailyDoc({
      sid: 'A1', date: '2026-10-28', blocker: '', absent: false, next: '続きをやる予定',
      entries: [{ kind: 'task', taskId: 't', note: 'x', result: 'done' }, { kind: 'study', note: 'y' }],
    }, undefined, 1);
    expect(doc.next).toBe('続きをやる予定');
    expect(doc.entries).toEqual([{ kind: 'task', taskId: 't', note: 'x', result: 'done' }, { kind: 'study', note: 'y' }]);
  });
});
