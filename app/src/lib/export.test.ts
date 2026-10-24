import { describe, expect, test } from 'vitest';
import {
  calendarCsv, counts, csvCell, dailiesCsv, meetingsCsv, rosterCsv, tasksCsv, teacherNotesCsv, teamSubcollections,
  toCsv, withoutTeacherOnly, type Backup,
} from './export';

const backup = (): Backup => ({
  meta: { app: 'sotsuken-pj', version: 1, exportedAt: '2026-10-28T00:00:00Z', includesTeacherNotes: true },
  collections: {
    roster: [
      { id: 'a1@trident.ac.jp', name: '岩田', role: 'student', teamId: 'A', sid: 'A1' },
      { id: 't@trident.ac.jp', name: '先生', role: 'teacher', teamId: null, sid: null },
    ],
    teams: [{ id: 'A', members: [{ sid: 'A1', name: '岩田' }] }],
    'teams/A/tasks': [
      { id: 't2', title: '=SUM(1,2)', depth: 2, order: 2, parentId: 't1', status: 'doing', assignees: ['A1'], startDate: '2026-11-01', endDate: null, detail: '1行目\n2行目, "引用"', links: [{ url: 'https://x', label: '設計' }], source: 'draft', deleted: false, createdBy: 'teacher', updatedBy: 'A1', updatedAt: Date.parse('2026-10-28T03:00:00Z') },
      { id: 't1', title: '要件定義', depth: 1, order: 1, parentId: null, status: 'todo', assignees: [], deleted: true, createdBy: 'teacher', updatedBy: 'teacher' },
    ],
    'teams/A/dailyReports': [
      { id: '2026-10-28_A1', sid: 'A1', date: '2026-10-28', entries: [{ kind: 'task', taskId: 't2', note: '進めた' }, { kind: 'study', note: '調べた' }], blocker: '困った', absent: false },
      { id: '2026-10-28_A2', sid: 'A2', date: '2026-10-28', entries: [], blocker: '', absent: true },
    ],
    'teams/A/meetings': [{ id: '2026-10-29', date: '2026-10-29', decided: '決定', actions: [{ text: 'やる1', done: true }, { text: 'やる2', done: false }], note: '' }],
    milestones: [{ id: 'm', title: '企画決定', date: '2026-10-28', endDate: null, teamId: null }],
    config: [{ id: 'classDays', days: [{ date: '2026-10-28', periods: '3-4', meeting: false, note: '' }] }, { id: 'settings', peerDailyView: true }],
    teacherNotes: [{ id: 'n', teamId: 'A', body: '要フォロー', createdAt: Date.parse('2026-10-28T03:00:00Z') }],
  },
});

describe('csvCell / toCsv', () => {
  test('エスケープ', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('1\n2')).toBe('"1\n2"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(3)).toBe('3');
    expect(csvCell(-3)).toBe('-3'); // 数値はそのまま
    expect(csvCell(true)).toBe('TRUE');
  });
  test('数式として実行されないようにする', () => {
    for (const s of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx']) expect(csvCell(s).startsWith("'") || csvCell(s).startsWith('"\'')).toBe(true);
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('通常の文字')).toBe('通常の文字');
  });
  test('BOM 付きで CRLF', () => {
    expect(toCsv([['a', 'b'], [1, 2]])).toBe('﻿a,b\r\n1,2\r\n');
  });
});

describe('各CSV', () => {
  test('タスク: 担当は苗字、大項目→子の順、数式のガード、詳細の改行', () => {
    const lines = tasksCsv(backup()).replace('﻿', '');
    expect(lines.split('\r\n')[0]).toBe('チーム,ID,親ID,階層,タイトル,状態,担当,開始日,終了日,詳細,リンク,叩き台,削除済み,作成者,更新者,更新日時');
    expect(lines).toContain(`"'=SUM(1,2)"`); // 数式にならないよう ' を付け、カンマを含むので囲む
    expect(lines).toContain('"1行目\n2行目, ""引用"""');
    expect(lines).toContain('設計 https://x');
    expect(lines).toContain(',進行中,岩田,2026-11-01,');
    expect(lines).toContain('叩き台');
    expect(lines).toContain('2026-10-28 12:00'); // 日本時間
    expect(lines.indexOf('要件定義')).toBeLessThan(lines.indexOf('SUM')); // 大項目が先
  });
  test('作業レポート: 1項目1行。タスク名、結果、次にやること、欠席', () => {
    const out = dailiesCsv(backup()).replace('﻿', '').split('\r\n');
    expect(out[1]).toBe(`2026-10-28,A,A1,岩田,タスク,"'=SUM(1,2)",,進めた,,FALSE`);
    expect(out[2]).toBe('2026-10-28,A,A1,岩田,調査・勉強,,,調べた,,FALSE');
    expect(out[3]).toBe('2026-10-28,A,A2,,,,,,,TRUE'); // 欠席 (内容なし)。名簿にない sid は苗字なし
  });
  test('ミーティング記録・名簿・予定と授業日・教員メモ', () => {
    expect(meetingsCsv(backup())).toContain('A,2026-10-29,決定,"やる1\nやる2",やる1,');
    expect(rosterCsv(backup()).replace('\uFEFF', '').split('\r\n').slice(1, 3)).toEqual([',先生,,t@trident.ac.jp,教員', 'A1,岩田,A,a1@trident.ac.jp,学生']); // 教員が先
    expect(calendarCsv(backup())).toContain('予定,2026-10-28,,企画決定,共通,');
    expect(calendarCsv(backup())).toContain('授業日,2026-10-28,,,3-4限,FALSE');
    expect(teacherNotesCsv(backup())).toContain('A,2026-10-28 12:00,要フォロー');
  });
});

describe('バックアップの補助', () => {
  test('件数・チームのサブコレクション・教員専用の除外', () => {
    expect(counts(backup()).find((c) => c.label === '作業レポート')?.n).toBe(2);
    expect(teamSubcollections(['A', 'B'])).toContain('teams/B/dailyReports');
    const b = withoutTeacherOnly(backup());
    expect(b.collections.teacherNotes).toBeUndefined();
    expect(b.meta.includesTeacherNotes).toBe(false);
    expect(b.collections.roster).toHaveLength(2);
  });
});
