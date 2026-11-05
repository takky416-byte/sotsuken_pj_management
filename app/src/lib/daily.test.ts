import { describe, expect, test } from 'vitest';
import type { ClassDay } from '../types';
import {
  charCount, classDatesBetween, consecutiveMisses, recentClassDates, dailyDoc, dailyId, entriesMissingNote, statusOf, validateDaily, type Daily, type DayStatus,
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

describe('validateDaily: 新しく提出する作業ログは、しっかり書かせる', () => {
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

describe('recentClassDates', () => {
  const days = ['2026-10-14', '2026-10-21', '2026-10-28', '2026-11-04', '2026-11-11'].map((date) => ({ date, periods: '3-4' as const, meeting: false, note: '' }));
  test('今日を含めず、直近の授業日を新しい順に3回(昇順で返す)', () => {
    expect(recentClassDates(days, '2026-10-01', '2026-11-11', 3)).toEqual(['2026-10-21', '2026-10-28', '2026-11-04']);
  });
  test('今日が授業日でなくても、今日より前の3回', () => {
    expect(recentClassDates(days, '2026-10-01', '2026-11-06', 3)).toEqual(['2026-10-21', '2026-10-28', '2026-11-04']);
  });
  test('読み込んだ期間(from)より前は出さない。足りなければ、あるだけ', () => {
    expect(recentClassDates(days, '2026-10-28', '2026-11-11', 3)).toEqual(['2026-10-28', '2026-11-04']);
    expect(recentClassDates(days, '2026-10-01', '2026-10-14', 3)).toEqual([]);
  });
});

describe('作業なしの提出・次にやることが未定', () => {
  const base = { id: 'x', sid: 'A1', date: '2026-11-05', dayKey: 20261105, entries: [], blocker: '', absent: false } as Daily;
  test('作業なしは、提出として数える (欠席が優先)', () => {
    expect(statusOf({ ...base, noWork: true })).toBe('submitted');
    expect(statusOf({ ...base, noWork: true, absent: true })).toBe('absent');
    expect(statusOf(base)).toBe('missing');
  });
  test('作業なしのときは、やったことの記入は要らない。次にやること(か、未定)だけ', () => {
    expect(validateDaily([], '', () => '', { noWork: true })).toHaveLength(1);
    expect(validateDaily([], '', () => '', { noWork: true, nextUndecided: true })).toEqual([]);
    expect(validateDaily([], 'ER図の主なテーブルを3つ作る予定です', () => '', { noWork: true })).toEqual([]);
  });
  test('作業ありでも、次にやることは未定にできる。作業なし以外では、取り組みの記入が要る', () => {
    const e = [{ kind: 'task' as const, taskId: 't', note: 'ER図の主なテーブルを3つ作った', result: 'progress' as const }];
    expect(validateDaily(e, '', () => '', { nextUndecided: true })).toEqual([]);
    expect(validateDaily([], '', () => '').some((p) => p.key === 'entries')).toBe(true);
  });
  test('書き込む形: noWork・理由・未定は、あるときだけ入る', () => {
    const plain = dailyDoc({ sid: 'A1', date: '2026-11-05', entries: [], blocker: '', absent: false, next: 'x' }, undefined, 1);
    expect('noWork' in plain || 'nextUndecided' in plain).toBe(false);
    const nw = dailyDoc({ sid: 'A1', date: '2026-11-05', entries: [], blocker: '', absent: false, noWork: true, noWorkReason: 'time', nextUndecided: true }, undefined, 1);
    expect(nw).toMatchObject({ noWork: true, noWorkReason: 'time', nextUndecided: true });
  });
});
