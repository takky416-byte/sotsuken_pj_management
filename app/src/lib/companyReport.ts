// 企業に提出する進捗報告書の中身。画面の「PJ分析」(チーム内の振り返り) とは別に、
// 外に出してよい情報だけを、報告書の順に並べる。個人別の負荷・WBSにない作業・コーチングの言い回しは含めない。
import type { Milestone, ReportNotes, Task, Team } from '../types';
import { analyze } from './analysis';
import { addDays, jstDate } from './dates';
import { daysBetween } from './gantt';
import { isLeaf, isPlaceholder } from './meetingView';
import { ADHOC_ROOT_ID } from './adhoc';

export type Judgement = '順調' | 'やや遅れ' | '遅れ' | '集計中';

export type CompanyReport = {
  title: string;
  teamId: string;
  projectName: string;
  members: string[];
  today: string;
  /** 報告の対象期間 (キックオフの日〜報告日) */
  from: string | null;
  summary: string;
  judgement: Judgement;
  plannedPct: number;
  actualPct: number;
  counts: { total: number; done: number; doing: number; todo: number; hold: number };
  phases: { title: string; start: string | null; end: string | null; done: number; total: number; pct: number; state: string }[];
  milestones: { date: string; endDate: string | null; title: string; state: '済' | '予定'; daysLeft: number | null }[];
  recent: { title: string; phase: string }[];
  /** 計画より遅れているタスク (期限を過ぎて未完了) */
  overdue: { title: string; phase: string; end: string }[];
  issuesText: string;
  upcoming: { title: string; phase: string; start: string | null; end: string | null }[];
  nextText: string;
  /** 文章が空の項目 (画面で、書くよう促す) */
  missing: ('summary' | 'issues' | 'next')[];
};

const RECENT_DAYS = 14;
const UPCOMING_DAYS = 28;
const MAX_LIST = 10;

export const REPORT_TITLE = '卒業研究制作 プロジェクト進捗報告書';

export function buildCompanyReport(
  team: Pick<Team, 'id' | 'projectName' | 'members' | 'kickoffAt'>,
  tasks: Task[], milestones: Milestone[], notes: ReportNotes | null | undefined, today: string = jstDate(),
): CompanyReport {
  const live = tasks.filter((t) => !t.deleted);
  const a = analyze(tasks, milestones, team.members, today);
  const byId = new Map(live.map((t) => [t.id, t]));
  const phaseOf = (t: Task): string => {
    let cur: Task | undefined = t;
    for (let i = 0; i < 4 && cur?.parentId; i++) cur = byId.get(cur.parentId);
    return cur?.title ?? '';
  };
  const leaves = live.filter((t) => isLeaf(live, t) && !isPlaceholder(live, t) && t.id !== ADHOC_ROOT_ID);
  const open = leaves.filter((t) => t.status !== 'done' && t.status !== 'hold');
  const dayOf = (ms: number) => (Number.isFinite(ms) ? jstDate(new Date(ms)) : '');

  const judgement: Judgement = a.total - a.hold <= 0 ? '集計中' : a.gap <= -15 ? '遅れ' : a.gap < -5 ? 'やや遅れ' : '順調';
  const recent = leaves
    .filter((t) => t.status === 'done' && dayOf(t.updatedAt) >= addDays(today, -RECENT_DAYS))
    .sort((x, y) => y.updatedAt - x.updatedAt).slice(0, MAX_LIST).map((t) => ({ title: t.title, phase: phaseOf(t) }));
  const horizon = addDays(today, UPCOMING_DAYS);
  const upcoming = open
    .filter((t) => (t.startDate ?? t.endDate) !== null && (t.startDate ?? t.endDate as string) <= horizon && (t.endDate ?? t.startDate as string) >= today)
    .sort((x, y) => (x.endDate ?? x.startDate ?? '').localeCompare(y.endDate ?? y.startDate ?? ''))
    .slice(0, MAX_LIST).map((t) => ({ title: t.title, phase: phaseOf(t), start: t.startDate, end: t.endDate }));
  const overdue = a.overdue.slice(0, MAX_LIST).map((t) => ({ title: t.title, phase: phaseOf(t), end: t.endDate as string }));

  const phaseState = (done: number, total: number, doing: boolean) => (total > 0 && done === total ? '完了' : done > 0 || doing ? '進行中' : '未着手');
  const phases = a.phases.map((p) => ({
    title: p.title, start: p.start, end: p.end, done: p.done, total: p.total, pct: p.pct,
    state: phaseState(p.done, p.total, p.status === 'doing'),
  }));

  const text = (s: string | undefined) => (s ?? '').trim();
  const missing = (['summary', 'issues', 'next'] as const).filter((k) => !text(notes?.[k]));
  return {
    title: REPORT_TITLE, teamId: team.id, projectName: team.projectName, members: team.members.map((m) => m.name), today,
    from: team.kickoffAt ? jstDate(new Date(team.kickoffAt)) : null,
    summary: text(notes?.summary), judgement, plannedPct: a.plannedPct, actualPct: a.progressPct,
    counts: { total: a.total, done: a.done, doing: a.doing, todo: a.todo, hold: a.hold },
    phases,
    milestones: [...milestones].sort((x, y) => x.date.localeCompare(y.date)).map((m) => {
      const end = m.endDate ?? m.date;
      return { date: m.date, endDate: m.endDate ?? null, title: m.title, state: end < today ? '済' as const : '予定' as const, daysLeft: end < today ? null : Math.max(0, daysBetween(today, m.date)) };
    }),
    recent, overdue, issuesText: text(notes?.issues), upcoming, nextText: text(notes?.next), missing,
  };
}
