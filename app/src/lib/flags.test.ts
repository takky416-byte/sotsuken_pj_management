import { describe, expect, test } from 'vitest';
import type { ClassDay, Task, Team } from '../types';
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
  entries: [{ kind: 'study', note: '' }], blocker: '', absent: false, ...over,
});

describe('teamFlags', () => {
  test('直近の授業日の提出人数 (欠席は未提出に数えない)', () => {
    const f = teamFlags(team(), [], [sub('A1', '2026-11-04'), sub('A2', '2026-11-04', { entries: [], absent: true })], days, '2026-11-04', '2026-10-28');
    expect(f.latestDay).toBe('2026-11-04');
    expect(f.submitted).toBe(2);
  });
  test('2回連続の未提出。今日の分は数えない', () => {
    // 10/28, 10/29, 11/4 が対象 (今日 11/5 より前)。A2 は 10/29 と 11/4 が未提出
    const dailies = [sub('A1', '2026-10-28'), sub('A1', '2026-10-29'), sub('A1', '2026-11-04'), sub('A2', '2026-10-28')];
    expect(teamFlags(team(), [], dailies, days, '2026-11-05', '2026-10-28').missing).toEqual(['近内']);
    expect(teamFlags(team(), [], dailies, days, '2026-11-04', '2026-10-28').missing).toEqual([]); // 11/4 当日はまだ数えない
  });
  test('キックオフ前や、キックオフ前の授業日は数えない', () => {
    expect(teamFlags(team(null), [], [], days, '2026-11-05', '2026-10-28').missing).toEqual([]);
    expect(teamFlags(team(Date.parse('2026-11-04T03:00:00Z')), [], [], days, '2026-11-05', '2026-10-28').missing).toEqual([]); // 対象は 11/4 の1日だけ
  });
  test('日報の運用開始日より前の授業日は数えない', () => {
    // 10/28 が運用開始前なら、対象は 10/29 と 11/4 の2日。A2 は両方未提出 → フラグ。A1 は 10/29 だけ提出 → 11/4 の1回だけなのでフラグなし
    const dailies = [sub('A1', '2026-10-29')];
    expect(teamFlags(team(), [], dailies, days, '2026-11-05', '2026-10-29').missing).toEqual(['近内']);
    // 運用開始が 11/4 なら、対象は 11/4 の1日だけ → フラグなし
    expect(teamFlags(team(), [], [], days, '2026-11-05', '2026-11-04').missing).toEqual([]);
    // 直近の授業日の提出人数も、運用開始前の日は対象にしない
    expect(teamFlags(team(), [], [], days, '2026-10-28', '2026-10-29').latestDay).toBeNull();
  });
  test('担当なしで期限超過のタスク', () => {
    const t = (over: Partial<Task>): Task => ({
      id: 'x', title: 'x', detail: '', parentId: null, depth: 1, order: 1, status: 'todo', assignees: [],
      startDate: null, endDate: '2026-11-01', links: [], source: 'user', createdBy: '', updatedBy: '',
      createdAt: 0, updatedAt: 0, deleted: false, deletedAt: null, ...over,
    });
    const tasks = [t({}), t({ assignees: ['A1'] }), t({ status: 'done' }), t({ deleted: true }), t({ endDate: '2026-11-30' }), t({ endDate: null })];
    expect(teamFlags(team(), tasks, [], days, '2026-11-05', '2026-10-28').unassignedOverdue).toBe(1);
  });
});
