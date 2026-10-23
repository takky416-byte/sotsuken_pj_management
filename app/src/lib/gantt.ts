import type { Milestone, Task, TaskStatus } from '../types';
import { addDays } from './dates';
import { childrenOf, effectiveStatuses } from './wbs';

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
  const eff = effectiveStatuses(live); // 親タスクは、子の状態から自動で決まる
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
        const st = eff.get(t.id) ?? t.status;
        rows.push({ task: t, depth: t.depth, ...s, status: st, overdue: !!s.end && s.end < today && st !== 'done' && st !== 'hold' });
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

/**
 * 日付を入れたときの、開始日・終了日の組。片方だけ入れたら、もう片方も同じ日にする。
 * 終了が開始より前になるときは、変えた側に合わせて、もう片方を直す。
 */
export function nextDates(
  cur: { startDate: string | null; endDate: string | null },
  field: 'startDate' | 'endDate',
  value: string,
): { startDate: string | null; endDate: string | null } {
  if (!value) return { ...cur, [field]: null };
  if (field === 'startDate') {
    return { startDate: value, endDate: cur.endDate && cur.endDate >= value ? cur.endDate : value };
  }
  return { startDate: cur.startDate && cur.startDate <= value ? cur.startDate : value, endDate: value };
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

export type MilestonePlace = { id: string; lane: number; align: 'left' | 'right' };

/**
 * マイルストーンの文字が重ならないように、段 (lane) に振り分ける。
 * 画面の幅は分からないので、トラックの幅を trackPx と仮定して、文字の幅を見積もる。
 * 右端に近いものは、右に伸ばすと切れるので、左に伸ばす (align: 'right')。
 */
export function placeMilestones(
  ms: { id: string; title: string; date: string }[], g: Pick<Gantt, 'start' | 'days'>, trackPx = 800, charPx = 11,
): { places: MilestonePlace[]; lanes: number } {
  const sorted = [...ms].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  const laneEnd: number[] = [];
  const places: MilestonePlace[] = [];
  for (const m of sorted) {
    const x = (pct(g, m.date) / 100) * trackPx;
    const w = 16 + m.title.length * charPx;
    const align = x + w > trackPx ? 'right' : 'left';
    const [from, to] = align === 'left' ? [x - 6, x - 6 + w] : [x + 6 - w, x + 6];
    let lane = laneEnd.findIndex((end) => end + 6 <= from);
    if (lane < 0) lane = laneEnd.length;
    laneEnd[lane] = to;
    places.push({ id: m.id, lane, align });
  }
  return { places, lanes: Math.max(1, laneEnd.length) };
}

export type LightningPoint = {
  /** 行の番号 (上から 0) */
  row: number;
  /** 位置 (%) */
  x: number;
  /** 今日より何日ぶん、遅れて (負) /進んで (正) いるか。目安 */
  days: number;
};

/**
 * 稲妻線: 予定どおりなら今日の線の上、遅れていれば左、先行していれば右に折れる。上から順につなぐ。
 * 左: 予定の期間に入っているのに「未着手」のタスク (開始日の位置まで戻る。長く着手していないほど、大きく左へ)。
 * 右: 予定の開始日より前に「進行中」になっているタスク (開始日の位置まで進む)、予定の終了日より前に「完了」しているタスク (終了日の位置まで進む)。早いほど、大きく右へ。
 * それ以外 (予定の期間内の進行中・保留、期限が過ぎた完了、日付なし、まだ始まっていない未着手) は、今日の線の上に置く。
 * 子が表示されている親の行 (大項目など) は、子と重なって意味が薄いので、点を打たない (前後の点を、まっすぐつなぐ)。
 */
export function lightning(
  g: Pick<Gantt, 'start' | 'days' | 'rows'>, today: string, maxDepth: 1 | 2 | 3 = 2, hasChildren: (id: string) => boolean = () => false,
): LightningPoint[] {
  const nowDay = daysBetween(g.start, today) + 0.5; // 今日の真ん中
  const toX = (day: number) => Math.min(100, Math.max(0, (day / g.days) * 100));
  const out: LightningPoint[] = [];
  g.rows.forEach((r, row) => {
    if (hasChildren(r.task.id) && r.depth < maxDepth) return; // 子が表示されている親
    let at = nowDay;
    if (r.start && r.status === 'todo' && r.start <= today) at = daysBetween(g.start, r.start); // 遅れ: 開始日の位置 (進み具合 0)
    else if (r.start && r.status === 'doing' && r.start > today) at = daysBetween(g.start, r.start); // 先行: 予定より早く着手
    else if (r.end && r.status === 'done' && r.end > today) at = daysBetween(g.start, r.end) + 1; // 先行: 終了日の終わり
    out.push({ row, x: toX(at), days: Math.round((at - nowDay) * 10) / 10 });
  });
  return out;
}
