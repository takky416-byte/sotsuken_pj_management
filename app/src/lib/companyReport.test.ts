import { describe, expect, test } from 'vitest';
import type { Task } from '../types';
import { buildCompanyReport } from './companyReport';

const T = (id: string, o: Partial<Task> = {}): Task => ({
  id, title: id, detail: '', parentId: null, depth: 1, order: 1, status: 'todo', assignees: [], startDate: null, endDate: null,
  links: [], source: 'user', createdBy: 'x', updatedBy: 'x', createdAt: 1, updatedAt: 1, deleted: false, deletedAt: null, ...o,
});
const TODAY = '2026-11-20';
const NOW = Date.parse('2026-11-18T03:00:00Z');
const team = { id: 'A', projectName: '企画A', members: [{ sid: 'A1', name: '甲' }, { sid: 'A2', name: '乙' }], kickoffAt: Date.parse('2026-10-28T03:00:00Z') };
const tasks = [
  T('設計'), T('画面を描く', { parentId: '設計', depth: 2, status: 'done', assignees: ['A1'], startDate: '2026-11-01', endDate: '2026-11-10', updatedAt: NOW }),
  T('古い完了', { parentId: '設計', depth: 2, status: 'done', startDate: '2026-10-30', endDate: '2026-11-02', updatedAt: Date.parse('2026-10-31T00:00:00Z') }),
  T('遅れている', { parentId: '設計', depth: 2, status: 'doing', assignees: ['A2'], startDate: '2026-11-05', endDate: '2026-11-12' }),
  T('来週やる', { parentId: '設計', depth: 2, startDate: '2026-11-23', endDate: '2026-11-27' }),
  T('ずっと先', { parentId: '設計', depth: 2, startDate: '2027-01-10', endDate: '2027-01-20' }),
  T('WBS外の作業', { parentId: '設計', depth: 2, source: 'adhoc', status: 'done', updatedAt: NOW }),
];
const ms = [{ id: 'm1', title: '外部設計レビュー', date: '2026-11-25', teamId: null }, { id: 'm0', title: '企画決定', date: '2026-10-28', teamId: null }];

describe('buildCompanyReport', () => {
  const r = buildCompanyReport(team, tasks, ms, { summary: ' 概要です ', issues: '', next: '', by: 'A1', at: 1 }, TODAY);
  test('表題・期間・体制', () => {
    expect(r.title).toBe('卒業研究制作 プロジェクト進捗報告書');
    expect(r.from).toBe('2026-10-28');
    expect(r.members).toEqual(['甲', '乙']);
    expect(r.summary).toBe('概要です');
  });
  test('直近の実績は、2週間以内に完了したものだけ。工程名つき', () => {
    expect(r.recent.map((x) => x.title)).toContain('画面を描く');
    expect(r.recent.map((x) => x.title)).not.toContain('古い完了');
    expect(r.recent[0].phase).toBe('設計');
  });
  test('遅れているタスクと、4週間以内の予定', () => {
    expect(r.overdue.map((x) => x.title)).toEqual(['遅れている']);
    expect(r.upcoming.map((x) => x.title)).toContain('来週やる');
    expect(r.upcoming.map((x) => x.title)).not.toContain('ずっと先');
  });
  test('マイルストーンは日付順。過ぎたものは「済」、先のものは残り日数', () => {
    expect(r.milestones.map((m) => [m.title, m.state, m.daysLeft])).toEqual([['企画決定', '済', null], ['外部設計レビュー', '予定', 5]]);
  });
  test('未記入の文章を知らせる。WBS外の作業の数や、個人別の負荷は、報告書の中身に入らない', () => {
    expect(r.missing).toEqual(['issues', 'next']);
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/adhoc|skew|偏り|assigned/);
  });
  test('進み具合の総合判定', () => {
    expect(['順調', 'やや遅れ', '遅れ']).toContain(r.judgement);
    expect(buildCompanyReport(team, [], [], null, TODAY).judgement).toBe('集計中');
  });
});
