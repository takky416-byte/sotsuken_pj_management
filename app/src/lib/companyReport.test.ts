import { describe, expect, test } from 'vitest';
import type { Task } from '../types';
import { buildCompanyReport, defaultSummary } from './companyReport';

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

describe('文章の記入日', () => {
  const at = (d: string) => Date.parse(`${d}T03:00:00Z`);
  test('文章ごとの記入日が出る。文章のないものは空。古い保存 (日付なし) は、最後に保存した日', () => {
    const r = buildCompanyReport(team, tasks, ms, { summary: '概要', issues: '課題', next: '', by: 'A1', at: at('2026-11-19'), summaryAt: at('2026-11-01'), issuesAt: at('2026-11-15') }, TODAY);
    expect([r.summaryDate, r.issuesDate]).toEqual(['2026-11-01', '2026-11-15']);
    const old = buildCompanyReport(team, tasks, ms, { summary: '概要', issues: '', next: '', by: 'A1', at: at('2026-11-19') }, TODAY);
    expect(old.summaryDate).toBe('2026-11-19');
  });
});

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
  test('マイルストーンは、報告書に載せない', () => {
    expect(JSON.stringify(r)).not.toMatch(/外部設計レビュー|企画決定/);
  });
  test('「課題」と以前の「今後の方針」は、ひとつの文章にまとまる', () => {
    const m = buildCompanyReport(team, tasks, ms, { summary: 's', issues: '課題A', next: '方針B', by: 'A1', at: 1 }, TODAY);
    expect(m.issuesText).toBe('課題A\n方針B');
  });
  test('未記入の文章を知らせる。WBS外の作業の数や、個人別の負荷は、報告書の中身に入らない', () => {
    expect(r.missing).toEqual(['issues']);
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/adhoc|skew|偏り|assigned/);
  });
  test('進み具合の総合判定', () => {
    expect(['順調', 'やや遅れ', '遅れ']).toContain(r.judgement);
    expect(buildCompanyReport(team, [], [], null, TODAY).judgement).toBe('集計中');
  });
});

describe('defaultSummary', () => {
  test('企画名・人数・件数だけから作る', () => {
    const t = defaultSummary({ id: 'A', projectName: '駅の混雑アプリ', members: [1, 2, 3] }, 52);
    expect(t).toContain('Aチーム(3名)');
    expect(t).toContain('「駅の混雑アプリ」');
    expect(t).toContain('2027年2月6日');
    expect(t).toContain('52件');
  });
});
