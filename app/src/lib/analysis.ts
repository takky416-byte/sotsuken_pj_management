// プロジェクトの分析 (進み具合・遅れ・偏り・次のマイルストーンまでのペース)。
// ミーティング画面とPJ分析で使う。タスクのデータだけから求める (学生に見せてよい情報だけ)。
import type { Milestone, Task } from '../types';
import { ADHOC_ROOT_ID } from './adhoc';
import { addDays, jstDate } from './dates';
import { daysBetween } from './gantt';
import { isLeaf, isPlaceholder } from './meetingView';
import { effectiveStatuses, periodOf, childrenOf } from './wbs';

export type Finding = { level: 'good' | 'info' | 'warn'; text: string };

export type Phase = { id: string; title: string; done: number; total: number; pct: number; start: string | null; end: string | null; status: Task['status'] };
export type MemberLoad = { sid: string; name: string; assigned: number; open: number; doing: number; done: number; overdue: number };
export type MilestonePace = { title: string; date: string; daysLeft: number; remaining: number; needPerWeek: number; recentPerWeek: number };

export type ProjectAnalysis = {
  total: number; done: number; doing: number; todo: number; hold: number;
  /** 完了 ÷ (全体 − 保留)。% */
  progressPct: number;
  /** 予定では、今日までに終わっているはずの割合 (期間の終了日が今日以前) 。% */
  plannedPct: number;
  /** 実績 − 予定 (ポイント)。負なら遅れ */
  gap: number;
  overdue: Task[];
  undated: number;
  unassigned: number;
  adhoc: { count: number; sharePct: number };
  phases: Phase[];
  members: MemberLoad[];
  skewed: boolean;
  milestone: MilestonePace | null;
  findings: Finding[];
};

const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));
const dayOf = (ms: number): string => (Number.isFinite(ms) ? jstDate(new Date(ms)) : '');

export function analyze(
  tasks: Task[], milestones: Milestone[], members: { sid: string; name: string }[], today: string,
): ProjectAnalysis {
  const live = tasks.filter((t) => !t.deleted);
  const eff = effectiveStatuses(live);
  const leaves = live.filter((t) => isLeaf(live, t) && !isPlaceholder(live, t) && t.id !== ADHOC_ROOT_ID);
  const by = (s: Task['status']) => leaves.filter((t) => t.status === s);
  const total = leaves.length;
  const done = by('done').length; const doing = by('doing').length; const todo = by('todo').length; const hold = by('hold').length;
  const counted = total - hold;
  const progressPct = pct(done, counted);
  const due = leaves.filter((t) => t.status !== 'hold' && (t.endDate ?? t.startDate) !== null && (t.endDate ?? t.startDate as string) <= today).length;
  const plannedPct = pct(due, counted);
  const open = leaves.filter((t) => t.status !== 'done' && t.status !== 'hold');
  const overdue = open.filter((t) => t.endDate !== null && t.endDate < today).sort((a, b) => (a.endDate ?? '').localeCompare(b.endDate ?? ''));
  const undated = open.filter((t) => !t.startDate && !t.endDate).length;
  const unassigned = open.filter((t) => (t.assignees ?? []).length === 0).length;
  const adhocTasks = live.filter((t) => t.source === 'adhoc' && t.id !== ADHOC_ROOT_ID && isLeaf(live, t));

  const phases: Phase[] = childrenOf(live, null)
    .filter((t) => !isPlaceholder(live, t) && t.id !== ADHOC_ROOT_ID)
    .map((t) => {
      const sub = leaves.filter((l) => l.id === t.id || isUnder(live, l, t.id));
      const d = sub.filter((l) => l.status === 'done').length;
      const p = periodOf(live, t);
      return { id: t.id, title: t.title, done: d, total: sub.length, pct: pct(d, sub.filter((l) => l.status !== 'hold').length), start: p.start, end: p.end, status: eff.get(t.id) ?? t.status };
    });

  const load: MemberLoad[] = members.map((m) => {
    const mine = leaves.filter((t) => (t.assignees ?? []).includes(m.sid));
    return {
      sid: m.sid, name: m.name, assigned: mine.length,
      open: mine.filter((t) => t.status !== 'done' && t.status !== 'hold').length,
      doing: mine.filter((t) => t.status === 'doing').length,
      done: mine.filter((t) => t.status === 'done').length,
      overdue: mine.filter((t) => t.status !== 'done' && t.status !== 'hold' && t.endDate !== null && t.endDate < today).length,
    };
  });
  const opens = load.map((l) => l.open);
  const skewed = members.length >= 2 && Math.max(...opens) - Math.min(...opens) >= 3 && Math.max(...opens) >= 2 * Math.max(1, Math.min(...opens));

  const next = [...milestones].filter((m) => (m.endDate ?? m.date) >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  let milestone: MilestonePace | null = null;
  if (next) {
    const daysLeft = Math.max(0, daysBetween(today, next.date));
    const remaining = open.filter((t) => (t.endDate ?? t.startDate ?? '9999') <= next.date).length;
    const recent = leaves.filter((t) => t.status === 'done' && dayOf(t.updatedAt) >= addDays(today, -14)).length;
    const weeks = Math.max(1, daysLeft) / 7;
    milestone = {
      title: next.title, date: next.date, daysLeft, remaining,
      needPerWeek: Math.round((remaining / weeks) * 10) / 10, recentPerWeek: Math.round((recent / 2) * 10) / 10,
    };
  }

  const findings: Finding[] = [];
  const gap = progressPct - plannedPct;
  if (counted > 0) {
    if (gap <= -15) findings.push({ level: 'warn', text: `予定より進みが遅れています(予定 ${plannedPct}% / 実績 ${progressPct}%)。` });
    else if (gap < -5) findings.push({ level: 'info', text: `予定よりやや遅れ気味です(予定 ${plannedPct}% / 実績 ${progressPct}%)。` });
    else findings.push({ level: 'good', text: `ほぼ予定どおりです(予定 ${plannedPct}% / 実績 ${progressPct}%)。` });
  }
  if (overdue.length > 0) findings.push({ level: 'warn', text: `期限を過ぎたタスクが${overdue.length}件: ${overdue.slice(0, 3).map((t) => `「${t.title}」`).join('')}${overdue.length > 3 ? ' ほか' : ''}` });
  if (undated > 0) findings.push({ level: 'info', text: `期間が入っていないタスクが${undated}件あります。予定が見えないので、期間を入れましょう。` });
  if (unassigned > 0) findings.push({ level: 'info', text: `担当がいないタスクが${unassigned}件あります。` });
  if (skewed) {
    const hi = load.reduce((a, b) => (b.open > a.open ? b : a)); const lo = load.reduce((a, b) => (b.open < a.open ? b : a));
    findings.push({ level: 'warn', text: `担当の数に偏りがあります(${hi.name} ${hi.open}件 / ${lo.name} ${lo.open}件)。分担を話し合いましょう。` });
  }
  if (adhocTasks.length > 0) {
    const share = pct(adhocTasks.length, total);
    findings.push({ level: share >= 20 ? 'warn' : 'info', text: `WBSにない作業が${adhocTasks.length}件ありました(全体の${share}%)。${share >= 20 ? 'WBSの見積もりが足りていない可能性があります。計画を見直しましょう。' : 'WBSに取り込まれています。正しい場所に整理しましょう。'}` });
  }
  if (milestone && milestone.remaining > 0) {
    const tight = milestone.needPerWeek > Math.max(1, milestone.recentPerWeek) * 1.2;
    findings.push({
      level: tight ? 'warn' : 'info',
      text: `次のマイルストーン「${milestone.title}」(${milestone.date.slice(5).replace('-', '/')})まで${milestone.daysLeft}日。期限が間に合う残りは${milestone.remaining}件で、週${milestone.needPerWeek}件のペースが必要です(最近2週間は週${milestone.recentPerWeek}件)。${tight ? ' ペースを上げる必要があります。' : ''}`,
    });
  }
  if (counted > 0 && doing === 0 && todo > 0) findings.push({ level: 'info', text: '進行中のタスクがありません。次に着手するタスクを決めましょう。' });
  return { total, done, doing, todo, hold, progressPct, plannedPct, gap, overdue, undated, unassigned, adhoc: { count: adhocTasks.length, sharePct: pct(adhocTasks.length, total) }, phases, members: load, skewed, milestone, findings };
}

function isUnder(live: Task[], t: Task, ancestorId: string): boolean {
  let p = t.parentId;
  for (let i = 0; i < 4 && p; i++) {
    if (p === ancestorId) return true;
    p = live.find((x) => x.id === p)?.parentId ?? null;
  }
  return false;
}
