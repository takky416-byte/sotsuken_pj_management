import { describe, expect, test } from 'vitest';
import type { ClassDay, Team } from '../types';
import type { Daily } from './daily';
import { teamFlags } from './flags';

const days: ClassDay[] = ['2026-10-28', '2026-10-29', '2026-11-04', '2026-11-05'].map((date) => ({
  date, periods: '3-4', meeting: false, note: '',
}));
const team = (kickoffAt: number | null = Date.parse('2026-10-28T03:00:00Z')): Team => ({
  id: 'A', members: [{ sid: 'A1', name: '岩田' }, { sid: 'A2', name: '近内' }], status: 'active',
  projectName: 'x', proposals: [], driveUrl: '', kickoffAt, teamMeetingInput: false,
});
const sub = (sid: string, date: string, over: Partial<Daily> = {}): Daily => ({
  id: `${date}_${sid}`, sid, date, dayKey: Number(date.replaceAll('-', '')),
  entries: [{ kind: 'study', note: '調べた' }], blocker: '', absent: false, ...over,
});

describe('teamFlags', () => {
  test('直近の授業日の提出人数 (欠席は未提出に数えない)', () => {
    const f = teamFlags(team(), 0, [sub('A1', '2026-11-04'), sub('A2', '2026-11-04', { entries: [], absent: true })], days, '2026-11-04', '2026-10-28');
    expect(f.latestDay).toBe('2026-11-04');
    expect(f.submitted).toBe(2);
    expect(f.latestMissing).toEqual([]);
  });
  test('直近の授業日に、まだ出していない人の名前', () => {
    const f = teamFlags(team(), 0, [sub('A1', '2026-11-04')], days, '2026-11-04', '2026-10-28');
    expect(f.latestMissing).toEqual(['近内']);
  });
  test('2回連続の未提出。今日の分は数えない', () => {
    // 10/28, 10/29, 11/4 が対象 (今日 11/5 より前)。A2 は 10/29 と 11/4 が未提出
    const dailies = [sub('A1', '2026-10-28'), sub('A1', '2026-10-29'), sub('A1', '2026-11-04'), sub('A2', '2026-10-28')];
    expect(teamFlags(team(), 0, dailies, days, '2026-11-05', '2026-10-28').missing).toEqual(['近内']);
    expect(teamFlags(team(), 0, dailies, days, '2026-11-04', '2026-10-28').missing).toEqual([]); // 11/4 当日はまだ数えない
  });
  test('キックオフ前や、キックオフ前の授業日は数えない', () => {
    expect(teamFlags(team(null), 0, [], days, '2026-11-05', '2026-10-28').missing).toEqual([]);
    expect(teamFlags(team(Date.parse('2026-11-04T03:00:00Z')), 0, [], days, '2026-11-05', '2026-10-28').missing).toEqual([]); // 対象は 11/4 の1日だけ
  });
  test('作業ログの運用開始日より前の授業日は数えない', () => {
    // 10/28 が運用開始前なら、対象は 10/29 と 11/4 の2日。A2 は両方未提出 → フラグ。A1 は 10/29 だけ提出 → 11/4 の1回だけなのでフラグなし
    const dailies = [sub('A1', '2026-10-29')];
    expect(teamFlags(team(), 0, dailies, days, '2026-11-05', '2026-10-29').missing).toEqual(['近内']);
    // 運用開始が 11/4 なら、対象は 11/4 の1日だけ → フラグなし
    expect(teamFlags(team(), 0, [], days, '2026-11-05', '2026-11-04').missing).toEqual([]);
    // 直近の授業日の提出人数も、運用開始前の日は対象にしない
    expect(teamFlags(team(), 0, [], days, '2026-10-28', '2026-10-29').latestDay).toBeNull();
  });
  test('担当なしで期限超過のタスクの数は、集計メモから数えたものを、そのまま出す', () => {
    expect(teamFlags(team(), 3, [], days, '2026-11-05', '2026-10-28').unassignedOverdue).toBe(3);
  });
});
