import type { Milestone, Task, TaskStatus } from '../types';
import { addDays } from './dates';
import { childrenOf } from './wbs';

export type GanttRow = {
  task: Task;
  depth: number;
  /** 日付が自分に入っていないときは、子タスクの最小・最大から求める */
  start: string | null;
  end: string | null;
  derived: boolean;
  status: TaskStatus;
  overdue: boolean;
};

export type Gantt = {
  rows: GanttRow[];
  /** 日付が1つもないタスク (葉のみ) */
  undated: Task[];
  start: string;
  end: string;
  days: number;
};

const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86400000);
export const daysBetween = (a: string, b: string) => dayNum(b) - dayNum(a);

/** 表示位置 (%)。範囲外は 0〜100 に丸める。 */
export function pct(g: Pick<Gantt, 'start' | 'days'>, date: string): number {
  return Math.min(100, Math.max(0, (daysBetween(g.start, date) / g.days) * 100));
}

/** 大項目と中項目 (depth 1・2) を行にする。日付は葉の範囲から補う。 */
export function buildGantt(tasks: Task[], milestones: Milestone[], today: string, maxDepth: 1 | 2 | 3 = 2): Gantt {
  const live = tasks.filter((t) => !t.deleted);
  const span = (t: Task): { start: string | null; end: string | null; derived: boolean } => {
    const kids = childrenOf(live, t.id);
    const own = { start: t.startDate ?? t.endDate, end: t.endDate ?? t.startDate };
    if (own.start && own.end) return { ...own, derived: false };
    const ks = kids.map(span).filter((s) => s.start && s.end);
    if (ks.length === 0) return { start: null, end: null, derived: false };
    return {
      start: ks.map((s) => s.start as string).sort()[0],
      end: ks.map((s) => s.end as string).sort().reverse()[0],
      derived: true,
    };
  };

  const rows: GanttRow[] = [];
  const undated: Task[] = [];
  const walk = (parentId: string | null) => {
    for (const t of childrenOf(live, parentId)) {
      const s = span(t);
      if (t.depth <= maxDepth) {
        rows.push({ task: t, depth: t.depth, ...s, status: t.status, overdue: !!s.end && s.end < today && t.status !== 'done' && t.status !== 'hold' });
      }
      if (!s.start && childrenOf(live, t.id).length === 0 && t.status !== 'done') undated.push(t);
      walk(t.id);
    }
  };
  walk(null);

  const dates = [
    today,
    ...rows.flatMap((r) => [r.start, r.end]),
    ...milestones.flatMap((m) => [m.date, m.endDate ?? null]),
  ].filter((d): d is string => !!d).sort();
  const start = addDays(dates[0], -1);
  const end = addDays(dates[dates.length - 1], 1);
  return { rows, undated, start, end, days: Math.max(1, daysBetween(start, end)) };
}

/** 目盛り (月曜)。期間が長いときは、目盛りが16個以内になるよう間隔を広げる。 */
export function weekTicks(g: Pick<Gantt, 'start' | 'end'>): string[] {
  const out: string[] = [];
  let d = g.start;
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 1) d = addDays(d, 1);
  const weeks = Math.ceil(daysBetween(g.start, g.end) / 7);
  const step = 7 * Math.max(1, Math.ceil(weeks / 16));
  for (; d <= g.end; d = addDays(d, step)) out.push(d);
  return out;
}
