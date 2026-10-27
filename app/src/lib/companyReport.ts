// 企業に提出する進捗報告書の中身。画面の「PJ分析」(チーム内の振り返り) とは別に、
// 外に出してよい情報だけを、報告書の順に並べる。個人別の負荷・WBSにない作業・コーチングの言い回しは含めない。
import type { Milestone, ReportNotes, Task, Team } from '../types';
import { analyze } from './analysis';
import { addDays, jstDate } from './dates';
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
  /** 各文章の記入日 (YYYY-MM-DD)。文章がないときは空 */
  summaryDate: string;
  issuesDate: string;
  judgement: Judgement;
  plannedPct: number;
  actualPct: number;
  counts: { total: number; done: number; doing: number; todo: number; hold: number };
  phases: { title: string; start: string | null; end: string | null; done: number; total: number; pct: number; state: string }[];
  recent: { title: string; phase: string }[];
  /** 計画より遅れているタスク (期限を過ぎて未完了) */
  overdue: { title: string; phase: string; end: string }[];
  /** 課題と今後の方針 (チームの文章) */
  issuesText: string;
  upcoming: { title: string; phase: string; start: string | null; end: string | null }[];
  /** 文章が空の項目 (画面で、書くよう促す) */
  missing: ('summary' | 'issues')[];
};

const RECENT_DAYS = 14;
const UPCOMING_DAYS = 28;
const MAX_LIST = 10;

/**
 * プロジェクトの概要の初期の文章。キックオフで、初期WBSと同時に作る (あとから、チームが直せる)。
 * 企画名・体制・期間・初期計画の大きさだけから作る (中身を推測して書かない)。
 */
export function defaultSummary(team: { id: string; projectName: string; members: unknown[] }, taskCount: number): string {
  const n = team.members.length;
  return `${team.id}チーム${n > 0 ? `(${n}名)` : ''}は、卒業研究制作として「${team.projectName}」に取り組みます。`
    + '2026年10月から、要件定義・外部設計・内部設計・実装・動作確認・改善の順に進め、2027年2月6日の卒業研究制作展で成果を発表します。'
    + `初期の計画は、${taskCount}件のタスクで構成し、進めながら見直します。`;
}

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
  // 記入日: 文章ごとの日時。なければ (古い保存) 最後に保存した日時
  const dateOf = (n: ReportNotes | null | undefined, k: 'summary' | 'issues' | 'next'): string => {
    const ms = n?.[`${k}At`] ?? n?.at;
    return text(n?.[k]) && ms !== undefined && Number.isFinite(ms) ? jstDate(new Date(ms)) : '';
  };
  const missing = (['summary', 'issues'] as const).filter((k) => !text(notes?.[k]));
  return {
    title: REPORT_TITLE, teamId: team.id, projectName: team.projectName, members: team.members.map((m) => m.name), today,
    from: team.kickoffAt ? jstDate(new Date(team.kickoffAt)) : null,
    summary: text(notes?.summary), summaryDate: dateOf(notes, 'summary'), issuesDate: dateOf(notes, 'issues') || dateOf(notes, 'next'), judgement, plannedPct: a.plannedPct, actualPct: a.progressPct,
    counts: { total: a.total, done: a.done, doing: a.doing, todo: a.todo, hold: a.hold },
    phases,
    recent, overdue, issuesText: [text(notes?.issues), text(notes?.next)].filter(Boolean).join('\n'), upcoming, missing,
  };
}
